import { handler } from "../../src/lambdas/waitForApproval"
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Wait For Approval Lambda Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'test-table';
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
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
      ...overrides,
    },
    taskToken: 'test-task-token-abc123',
  });

  describe('Successful Operations', () => {
    it('should successfully store task token', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body.message).toBe('Task token stored successfully');
      expect(result.body.leaveId).toBe('leave-123');
    });

    it('should store task token with correct PK and SK', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(ddbMock.calls()).toHaveLength(1);
      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input).toMatchObject({
        TableName: 'test-table',
        Item: {
          PK: 'TOKEN#leave-123',
          SK: 'TASKTOKEN',
        },
      });
    });

    it('should store all required token fields', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      const putCall = ddbMock.call(0);
      const item = putCall.args[0].input.item;

      expect(item).toMatchObject({
        PK: 'TOKEN#leave-123',
        SK: 'TASKTOKEN',
        taskToken: 'test-task-token-abc123',
        leaveId: 'leave-123',
      });
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('expiresAt');
    });

    it('should set expiration to 24 hours from now', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      const currentTime = Math.floor(Date.now() / 1000);
      await handler(event);

      const putCall = ddbMock.call(0);
      const item = putCall.args[0].input.Item;
      const expectedExpiration = currentTime + 86400; // 24 hours in seconds

      expect(item.expiresAt).toBe(expectedExpiration);
    });

    it('should set createdAt as ISO timestamp', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      const putCall = ddbMock.call(0);
      const item = putCall.args[0].input.Item;

      expect(item.createdAt).toBe('2024-01-15T10:00:00.000Z');
      expect(new Date(item.createdAt).toISOString()).toBe('2024-01-15T10:00:00.000Z');
    });
  });

  describe('Different Task Tokens', () => {
    it('should handle different task token formats', async () => {
      const testTokens = [
        'short-token',
        'very-long-task-token-with-many-characters-1234567890-abcdefg',
        'token_with_underscores',
        'token-with-special-chars-!@#',
      ];

      for (const token of testTokens) {
        ddbMock.reset();
        const event = createMockEvent();
        event.taskToken = token;
        ddbMock.on(PutCommand).resolves({});

        await handler(event);

        const putCall = ddbMock.call(0);
        expect(putCall.args[0].input.Item.taskToken).toBe(token);
      }
    });
  });

  describe('Different Leave Requests', () => {
    it('should handle different leave IDs', async () => {
      const event = createMockEvent({ leaveId: 'leave-456' });
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.PK).toBe('TOKEN#leave-456');
      expect(putCall.args[0].input.Item.leaveId).toBe('leave-456');
    });

    it('should handle leave requests with different data', async () => {
      const event = createMockEvent({
        leaveId: 'leave-789',
        userId: 'user-789',
        userName: 'Jane Smith',
        userEmail: 'jane@example.com',
        startDate: '2024-03-10',
        endDate: '2024-03-15',
        reason: 'Medical',
        status: 'PENDING',
        approverEmail: 'manager@example.com',
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(result.body.leaveId).toBe('leave-789');
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

    it('should throw error when table does not exist', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).rejects(new Error('ResourceNotFoundException'));

      await expect(handler(event)).rejects.toThrow('ResourceNotFoundException');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long task tokens', async () => {
      const longToken = 'a'.repeat(1000);
      const event = createMockEvent();
      event.taskToken = longToken;
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.taskToken).toBe(longToken);
    });

    it('should handle special characters in leave ID', async () => {
      const event = createMockEvent({ leaveId: 'leave-123-abc-xyz' });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCall = ddbMock.call(0);
      expect(putCall.args[0].input.Item.PK).toBe('TOKEN#leave-123-abc-xyz');
    });

    it('should handle concurrent token storage for different leaves', async () => {
      const event1 = createMockEvent({ leaveId: 'leave-001' });
      const event2 = createMockEvent({ leaveId: 'leave-002' });
      
      event1.taskToken = 'token-001';
      event2.taskToken = 'token-002';

      ddbMock.on(PutCommand).resolves({});

      await Promise.all([handler(event1), handler(event2)]);

      expect(ddbMock.calls()).toHaveLength(2);
      
      const call1 = ddbMock.call(0);
      const call2 = ddbMock.call(1);

      expect(call1.args[0].input.Item.leaveId).toBe('leave-001');
      expect(call2.args[0].input.Item.leaveId).toBe('leave-002');
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

    it('should log when handler is triggered', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith('WaitForApproval Lambda triggered');
    });

    it('should log the event data', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith('Event:', expect.any(String));
    });

    it('should log successful token storage', async () => {
      const event = createMockEvent();
      ddbMock.on(PutCommand).resolves({});

      await handler(event);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Task token stored for leave leave-123')
      );
    });

    it('should log errors when they occur', async () => {
      const event = createMockEvent();
      const error = new Error('Test error');
      ddbMock.on(PutCommand).rejects(error);

      try {
        await handler(event);
      } catch (e) {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith('Error storing task token:', error);
    });
  });

  describe('Time-based Tests', () => {
    it('should calculate expiration correctly at different times', async () => {
      const testDates = [
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-06-15T12:30:45Z'),
        new Date('2024-12-31T23:59:59Z'),
      ];

      for (const testDate of testDates) {
        ddbMock.reset();
        jest.setSystemTime(testDate);

        const event = createMockEvent();
        ddbMock.on(PutCommand).resolves({});

        await handler(event);

        const putCall = ddbMock.call(0);
        const item = putCall.args[0].input.Item;
        const expectedExpiration = Math.floor(testDate.getTime() / 1000) + 86400;

        expect(item.expiresAt).toBe(expectedExpiration);
      }
    });
  });
});