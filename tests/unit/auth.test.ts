import jwt from 'jsonwebtoken';
import { JWTPayload } from '../../src/shared/types';

const JWT_SECRET = 'test-secret-key';

describe('Auth Lambda', () => {
  describe('JWT Token Generation', () => {
    it('should generate a valid JWT token', () => {
      const user: JWTPayload = {
        userId: 'user123',
        email: 'john@example.com',
        name: 'John Doe',
        role: 'employee',
      };

      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should decode a valid JWT token', () => {
      const user: JWTPayload = {
        userId: 'user123',
        email: 'john@example.com',
        name: 'John Doe',
        role: 'employee',
      };

      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

      expect(decoded.userId).toBe(user.userId);
      expect(decoded.email).toBe(user.email);
      expect(decoded.name).toBe(user.name);
      expect(decoded.role).toBe(user.role);
    });

    it('should reject an invalid JWT token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => {
        jwt.verify(invalidToken, JWT_SECRET);
      }).toThrow();
    });

    it('should reject a token with wrong secret', () => {
      const user: JWTPayload = {
        userId: 'user123',
        email: 'john@example.com',
        name: 'John Doe',
        role: 'employee',
      };

      const token = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });

      expect(() => {
        jwt.verify(token, 'wrong-secret');
      }).toThrow();
    });
  });

  describe('User Roles', () => {
    it('should create token for employee role', () => {
      const employee: JWTPayload = {
        userId: 'emp123',
        email: 'employee@example.com',
        name: 'Employee User',
        role: 'employee',
      };

      const token = jwt.sign(employee, JWT_SECRET);
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

      expect(decoded.role).toBe('employee');
    });

    it('should create token for approver role', () => {
      const approver: JWTPayload = {
        userId: 'apr123',
        email: 'approver@example.com',
        name: 'Approver User',
        role: 'approver',
      };

      const token = jwt.sign(approver, JWT_SECRET);
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

      expect(decoded.role).toBe('approver');
    });
  });
});