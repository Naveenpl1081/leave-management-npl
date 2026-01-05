import { LeaveStatus } from '../../src/shared/types';
import { isValidDate, isEndDateValid, isValidEmail } from '../../src/shared/utils';

describe('Apply Leave Validation', () => {
  describe('Leave Request Validation', () => {
    it('should validate a correct leave request', () => {
      const startDate = '2026-02-01';
      const endDate = '2026-02-05';
      const approverEmail = 'manager@example.com';

      expect(isValidDate(startDate)).toBe(true);
      expect(isValidDate(endDate)).toBe(true);
      expect(isEndDateValid(startDate, endDate)).toBe(true);
      expect(isValidEmail(approverEmail)).toBe(true);
    });

    it('should reject leave with invalid dates', () => {
      const invalidDate = '2026/02/01';

      expect(isValidDate(invalidDate)).toBe(false);
    });

    it('should reject leave with end date before start date', () => {
      const startDate = '2026-02-05';
      const endDate = '2026-02-01';

      expect(isEndDateValid(startDate, endDate)).toBe(false);
    });

    it('should reject leave with invalid approver email', () => {
      const invalidEmail = 'not-an-email';

      expect(isValidEmail(invalidEmail)).toBe(false);
    });
  });

  describe('Leave Status', () => {
    it('should have correct leave statuses', () => {
      expect(LeaveStatus.PENDING).toBe('PENDING');
      expect(LeaveStatus.APPROVED).toBe('APPROVED');
      expect(LeaveStatus.REJECTED).toBe('REJECTED');
    });
  });
});