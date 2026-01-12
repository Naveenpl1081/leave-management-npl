import {generateToken, handler} from "../../src/lambdas/auth"
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import jwt from 'jsonwebtoken';

const ssmMock = mockClient(SSMClient);

describe('Authorizer Lambda Handler', () => {
  const mockSecret = 'test-secret-key-12345';
  const mockUserId = 'user-123';
  const mockEmail = 'test@example.com';
  const mockRole = 'approver';
  const mockName = 'Test User';

  beforeEach(() => {
    ssmMock.reset();
    process.env.JWT_SECRET_PARAM = '/test/jwt-secret';
    // Reset cached secret
    (global as any).cachedSecret = null;
  });

  const createMockEvent = (token: string): APIGatewayTokenAuthorizerEvent => ({
    type: 'TOKEN',
    methodArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/test/GET/resource',
    authorizationToken: token,
  });

  describe('Token Validation', () => {
    it('should throw error if authorization token is missing', async () => {
      const event = createMockEvent('');

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should throw error if token is invalid', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const event = createMockEvent('Bearer invalid-token');

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should throw error if JWT_SECRET_PARAM is not set', async () => {
      delete process.env.JWT_SECRET_PARAM;

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      await expect(handler(event)).rejects.toThrow('JWT_SECRET_PARAM not set');
    });

    it('should throw error if SSM parameter is not found', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: {},
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      await expect(handler(event)).rejects.toThrow('JWT secret not found in SSM');
    });

    it('should successfully validate a valid token', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      const result = await handler(event);

      expect(result.principalId).toBe(mockUserId);
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context.userId).toBe(mockUserId);
      expect(result.context.email).toBe(mockEmail);
      expect(result.context.role).toBe(mockRole);
      expect(result.context.name).toBe(mockName);
    });

    it('should handle token without Bearer prefix', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(validToken);

      const result = await handler(event);

      expect(result.principalId).toBe(mockUserId);
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });

    it('should throw error if token is expired', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const expiredToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret,
        { expiresIn: '-1h' }
      );
      const event = createMockEvent(`Bearer ${expiredToken}`);

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });
  });

  describe('Secret Caching', () => {
    it('should cache JWT secret after first retrieval', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );

      // First call
      await handler(createMockEvent(`Bearer ${validToken}`));
      
      // Second call
      await handler(createMockEvent(`Bearer ${validToken}`));

      // SSM should only be called once due to caching
      expect(ssmMock.calls()).toHaveLength(1);
    });
  });

  describe('Policy Generation', () => {
    it('should generate correct policy with all required fields', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      const result = await handler(event);

      expect(result).toHaveProperty('principalId');
      expect(result).toHaveProperty('policyDocument');
      expect(result).toHaveProperty('context');
      expect(result.policyDocument).toHaveProperty('Version', '2012-10-17');
      expect(result.policyDocument.Statement).toHaveLength(1);
      expect(result.policyDocument.Statement[0]).toMatchObject({
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: event.methodArn,
      });
    });

    it('should include all user context fields', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      const result = await handler(event);

      expect(result.context).toEqual({
        userId: mockUserId,
        email: mockEmail,
        role: mockRole,
        name: mockName,
      });
    });
  });

  describe('generateToken Function', () => {
    it('should generate a valid token', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const user = {
        userId: mockUserId,
        email: mockEmail,
        role: mockRole,
        name: mockName,
      };

      const token = await generateToken(user);
      const decoded = jwt.verify(token, mockSecret) as any;

      expect(decoded.userId).toBe(mockUserId);
      expect(decoded.email).toBe(mockEmail);
      expect(decoded.role).toBe(mockRole);
      expect(decoded.name).toBe(mockName);
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
    });

    it('should generate token with 24h expiration', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const user = {
        userId: mockUserId,
        email: mockEmail,
        role: mockRole,
        name: mockName,
      };

      const beforeGeneration = Math.floor(Date.now() / 1000);
      const token = await generateToken(user);
      const decoded = jwt.verify(token, mockSecret) as any;

      const expectedExpiration = beforeGeneration + 24 * 60 * 60;
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExpiration - 5);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExpiration + 5);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle SSM client errors', async () => {
      ssmMock.on(GetParameterCommand).rejects(new Error('SSM connection failed'));

      const validToken = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        mockSecret
      );
      const event = createMockEvent(`Bearer ${validToken}`);

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should handle malformed JWT', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const event = createMockEvent('Bearer malformed.jwt.token');

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });

    it('should handle JWT with wrong secret', async () => {
      ssmMock.on(GetParameterCommand).resolves({
        Parameter: { Value: mockSecret },
      });

      const tokenWithWrongSecret = jwt.sign(
        { userId: mockUserId, email: mockEmail, role: mockRole, name: mockName },
        'wrong-secret'
      );
      const event = createMockEvent(`Bearer ${tokenWithWrongSecret}`);

      await expect(handler(event)).rejects.toThrow('Unauthorized');
    });
  });
});