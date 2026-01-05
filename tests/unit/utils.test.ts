import {
    createResponse,
    successResponse,
    errorResponse,
    generateId,
    isValidEmail,
    isValidDate,
    isEndDateValid,
  } from '../../src/shared/utils';
  
  describe('Utility Functions', () => {
    describe('createResponse', () => {
      it('should create a valid API response', () => {
        const response = createResponse(200, { message: 'Success' });
        
        expect(response.statusCode).toBe(200);
        expect(response.headers['Content-Type']).toBe('application/json');
        expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
        expect(JSON.parse(response.body)).toEqual({ message: 'Success' });
      });
    });
  
    describe('successResponse', () => {
      it('should create a success response', () => {
        const data = { id: '123' };
        const response = successResponse(data, 'Operation successful');
        
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.message).toBe('Operation successful');
        expect(body.data).toEqual(data);
      });
    });
  
    describe('errorResponse', () => {
      it('should create an error response', () => {
        const response = errorResponse(400, 'Bad request', 'Invalid input');
        
        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Bad request');
        expect(body.error).toBe('Invalid input');
      });
    });
  
    describe('generateId', () => {
      it('should generate a unique ID', () => {
        const id1 = generateId();
        const id2 = generateId();
        
        expect(id1).toBeTruthy();
        expect(id2).toBeTruthy();
        expect(id1).not.toBe(id2);
        expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
      });
    });
  
    describe('isValidEmail', () => {
      it('should validate correct email addresses', () => {
        expect(isValidEmail('test@example.com')).toBe(true);
        expect(isValidEmail('user.name@company.co.uk')).toBe(true);
        expect(isValidEmail('john+tag@gmail.com')).toBe(true);
      });
  
      it('should reject invalid email addresses', () => {
        expect(isValidEmail('invalid')).toBe(false);
        expect(isValidEmail('test@')).toBe(false);
        expect(isValidEmail('@example.com')).toBe(false);
        expect(isValidEmail('test @example.com')).toBe(false);
      });
    });
  
    describe('isValidDate', () => {
      it('should validate correct date formats', () => {
        expect(isValidDate('2026-01-01')).toBe(true);
        expect(isValidDate('2026-12-31')).toBe(true);
      });
  
      it('should reject invalid date formats', () => {
        expect(isValidDate('2026/01/01')).toBe(false);
        expect(isValidDate('01-01-2026')).toBe(false);
        expect(isValidDate('2026-13-01')).toBe(false);
        expect(isValidDate('invalid')).toBe(false);
      });
    });
  
    describe('isEndDateValid', () => {
      it('should return true when end date is after start date', () => {
        expect(isEndDateValid('2026-01-01', '2026-01-05')).toBe(true);
      });
  
      it('should return true when end date equals start date', () => {
        expect(isEndDateValid('2026-01-01', '2026-01-01')).toBe(true);
      });
  
      it('should return false when end date is before start date', () => {
        expect(isEndDateValid('2026-01-05', '2026-01-01')).toBe(false);
      });
    });
  });