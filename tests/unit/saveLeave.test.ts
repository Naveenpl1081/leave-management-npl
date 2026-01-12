import { handler } from "../../src/lambdas/saveLeave"
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Save Leave Lambda Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'test-table';
  });

  const createMockEvent = (overrides = {}) => ({
    leaveRequest: {
      leaveId: 'leave-123',
      userId: 'user-123',
      userName: 'John Doe',
      userEmail: 'john@example.com',
      startDate: '2024-02-01',
      endDate: '2024-02-05',
      reason: 'Vacation',
      status: 'PENDING',
      approverEmail: 'approver@example.com',
      createdAt: '2024-01-15T10:00:00Z',
      ...overrides,
    },
  });

  describe('Successful Operations', () => {
    it('should successfully save a leave request', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body.message).toBe('Leave request saved successfully');
      expect(result.body.leaveId).toBe('leave-123');
    });

    it('should save leave request with correct PK and SK', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(ddbMock.calls()).toHaveLength(1);
      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input).toMatchObject({
        TableName: 'test-table',
        Item: {
          PK: 'leave-123',
          SK: 'user-123',
          leaveId: 'leave-123',
          userId: 'user-123',
        },
      });
    });

    it('should save all leave request fields', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      const putCall = ddbMock.call(0);
      const item = putCall.args[0].input.Item;

      expect(item).toMatchObject({
        PK: 'leave-123',
        SK: 'user-123',
        leaveId: 'leave-123',
        userId: 'user-123',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        reason: 'Vacation',
        status: 'PENDING',
        approverEmail: 'approver@example.com',
        createdAt: '2024-01-15T10:00:00Z',
      });
    });

    it('should handle different leave request data', async () => {
      const event = createMockEvent({
        leaveId: 'leave-456',
        userId: 'user-456',
        userName: 'Jane Smith',
        userEmail: 'jane@example.com',
        startDate: '2024-03-10',
        endDate: '2024-03-15',
        reason: 'Medical',
        status: 'PENDING',
        approverEmail: 'manager@example.com',
        createdAt: '2024-03-01T09:30:00Z',
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body.leaveId).toBe('leave-456');

      const putCall = ddbMock.call(0);
      const item = putCall.args[0].input.Item;
      expect(item.userName).toBe('Jane Smith');
      expect(item.reason).toBe('Medical');
    });
  });

  describe('DynamoDB Operations', () => {
    it('should use correct table name from environment', async () => {
      process.env.TABLE_NAME = 'custom-table-name';
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.TableName).toBe('custom-table-name');
    });

    it('should call PutCommand exactly once', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(ddbMock.calls()).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error on DynamoDB failure', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(handler(event)).rejects.toThrow('DynamoDB error');
    });

    it('should throw error on validation failure', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).rejects(new Error('Validation failed'));

      await expect(handler(event)).rejects.toThrow('Validation failed');
    });

    it('should throw error on permission issues', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).rejects(new Error('Access denied'));

      await expect(handler(event)).rejects.toThrow('Access denied');
    });

    it('should throw error on network issues', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).rejects(new Error('Network timeout'));

      await expect(handler(event)).rejects.toThrow('Network timeout');
    });
  });

  describe('Edge Cases', () => {
    it('should handle leave request with minimal fields', async () => {
      const event = {
        leaveRequest: {
          leaveId: 'leave-789',
          userId: 'user-789',
          userName: 'Test User',
          userEmail: 'test@example.com',
          startDate: '2024-04-01',
          endDate: '2024-04-01',
          reason: 'Personal',
          status: 'PENDING',
          approverEmail: 'approver@example.com',
          createdAt: '2024-03-25T12:00:00Z',
        },
      };

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body.leaveId).toBe('leave-789');
    });

    it('should handle leave request with special characters in reason', async () => {
      const event = createMockEvent({
        reason: 'Family emergency - urgent & important!',
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.reason).toBe('Family emergency - urgent & important!');
    });

    it('should handle leave request with long reason text', async () => {
      const longReason = 'A'.repeat(500);
      const event = createMockEvent({
        reason: longReason,
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.reason).toBe(longReason);
    });

    it('should handle email addresses with various formats', async () => {
      const event = createMockEvent({
        userEmail: 'user.name+tag@sub.example.co.uk',
        approverEmail: 'manager_1@example-corp.com',
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.userEmail).toBe('user.name+tag@sub.example.co.uk');
      expect(putCall.args[0].input.Item.approverEmail).toBe('manager_1@example-corp.com');
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log when save leave is triggered', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith('Save Leave Lambda triggered');
    });

    it('should log the event data', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith('Event:', expect.any(String));
    });

    it('should log successful save', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith(
        'Leave request saved to DynamoDB:',
        'leave-123'
      );
    });

    it('should log errors', async () => {
      const event = createMockEvent();
      const error = new Error('Test error');
      ddbMock.on(PutCommand).rejects(error);

      try {
        await handler(event);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith('Error saving leave:', error);
    });
  });
});