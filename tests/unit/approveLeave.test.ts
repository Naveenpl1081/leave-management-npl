import {handler} from "../../src/lambdas/approveLeave"
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { LeaveStatus } from "../../src/shared/types";

const ddbMock = mockClient(DynamoDBDocumentClient);
const sfnMock = mockClient(SFNClient);

describe('Approve Leave Lambda Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    sfnMock.reset();
    process.env.TABLE_NAME = 'test-table';
  });

  const createMockEvent = (body: any, userId?: string, role?: string): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/approve',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: userId ? {
        userId,
        role: role || 'approver',
      } : {},
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/approve',
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: 1234567890,
      resourceId: 'test-resource',
      resourcePath: '/approve',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: 'test-agent',
        userArn: null,
      },
    },
    resource: '/approve',
  });

  describe('Authorization', () => {
    it('should return 401 if userId is missing', async () => {
      const event = createMockEvent({ leaveId: 'leave-123', action: 'approve' });
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body).message).toBe('Unauthorized - Invalid user context');
    });

    it('should return 403 if user is not an approver', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'user-123',
        'employee'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body).message).toBe('Forbidden - Only approvers can approve leave requests');
    });
  });

  describe('Request Validation', () => {
    it('should return 400 if body is missing', async () => {
      const event = createMockEvent(null, 'approver-123', 'approver');
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Request body is required');
    });

    it('should return 400 if leaveId is missing', async () => {
      const event = createMockEvent({ action: 'approve' }, 'approver-123', 'approver');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing required fields: leaveId, action');
    });

    it('should return 400 if action is missing', async () => {
      const event = createMockEvent({ leaveId: 'leave-123' }, 'approver-123', 'approver');

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Missing required fields: leaveId, action');
    });

    it('should return 400 if action is invalid', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'invalid' },
        'approver-123',
        'approver'
      );

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Invalid action. Must be "approve" or "reject"');
    });
  });

  describe('Leave Request Processing', () => {
    it('should return 404 if leave request not found', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Leave request not found');
    });

    it('should return 404 if only token items exist', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [{ PK: 'leave-123', SK: 'TOKEN#xyz' }],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe('Leave request not found');
    });

    it('should return 400 if leave request is already approved', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.APPROVED,
          },
        ],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Leave request already approved');
    });

    it('should return 400 if leave request is already rejected', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'reject' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.REJECTED,
          },
        ],
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe('Leave request already rejected');
    });

    it('should return 404 if task token not found', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.PENDING,
          },
        ],
      });

      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toBe(
        'Task token not found. The approval window may have expired.'
      );
    });

    it('should successfully approve a leave request', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.PENDING,
          },
        ],
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'TOKEN#leave-123',
          SK: 'TASKTOKEN',
          taskToken: 'test-token-123',
        },
      });

      ddbMock.on(UpdateCommand).resolves({});
      sfnMock.on(SendTaskSuccessCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Leave request approved successfully');
      expect(body.data.leaveId).toBe('leave-123');
      expect(body.data.status).toBe(LeaveStatus.APPROVED);
      expect(body.data.approverId).toBe('approver-123');
    });

    it('should successfully reject a leave request', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'reject' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.PENDING,
          },
        ],
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'TOKEN#leave-123',
          SK: 'TASKTOKEN',
          taskToken: 'test-token-123',
        },
      });

      ddbMock.on(UpdateCommand).resolves({});
      sfnMock.on(SendTaskSuccessCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Leave request rejected successfully');
      expect(body.data.status).toBe(LeaveStatus.REJECTED);
    });

    it('should handle Step Functions error gracefully', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.PENDING,
          },
        ],
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'TOKEN#leave-123',
          SK: 'TASKTOKEN',
          taskToken: 'test-token-123',
        },
      });

      ddbMock.on(UpdateCommand).resolves({});
      sfnMock.on(SendTaskSuccessCommand).rejects(new Error('SFN Error'));

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).message).toBe('Leave request approved successfully');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on DynamoDB query error', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Failed to process leave request');
    });

    it('should return 500 on DynamoDB update error', async () => {
      const event = createMockEvent(
        { leaveId: 'leave-123', action: 'approve' },
        'approver-123',
        'approver'
      );

      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            PK: 'leave-123',
            SK: 'user-123',
            status: LeaveStatus.PENDING,
          },
        ],
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'TOKEN#leave-123',
          SK: 'TASKTOKEN',
          taskToken: 'test-token-123',
        },
      });

      ddbMock.on(UpdateCommand).rejects(new Error('Update failed'));

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toBe('Failed to process leave request');
    });
  });
});