import {
  calculateDoc,
  getFarmToday,
  isDateEditableBySupervisor,
  isLateOfflineSubmission,
  parseDateOnly,
  sumDecimals,
} from './date.utils';

describe('parseDateOnly', () => {
  it('parses calendar dates at UTC midnight', () => {
    expect(parseDateOnly('2026-07-13').toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });
});

describe('getFarmToday', () => {
  it('matches parseDateOnly for the farm timezone calendar day', () => {
    const today = getFarmToday('Asia/Kolkata');
    expect(today.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
  });
});

describe('calculateDoc', () => {
  it('returns 1 on stocking date', () => {
    const stocking = new Date('2026-06-16');
    const feeding = new Date('2026-06-16');
    expect(calculateDoc(stocking, feeding)).toBe(1);
  });

  it('returns correct DOC after days', () => {
    const stocking = new Date('2026-06-16');
    const feeding = new Date('2026-07-10');
    expect(calculateDoc(stocking, feeding)).toBe(25);
  });
});

describe('isDateEditableBySupervisor', () => {
  const tz = 'Asia/Kolkata';

  it('allows today', () => {
    const today = new Date();
    expect(isDateEditableBySupervisor(today, tz)).toBe(true);
  });

  it('allows yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isDateEditableBySupervisor(yesterday, tz)).toBe(true);
  });

  it('locks older dates', () => {
    const old = new Date();
    old.setDate(old.getDate() - 5);
    expect(isDateEditableBySupervisor(old, tz)).toBe(false);
  });
});

describe('isLateOfflineSubmission', () => {
  it('detects late submissions', () => {
    const old = new Date();
    old.setDate(old.getDate() - 5);
    expect(isLateOfflineSubmission(old, 'Asia/Kolkata')).toBe(true);
  });
});

describe('sumDecimals', () => {
  it('sums meal quantities', () => {
    expect(sumDecimals(['65', '65', '65', '65'])).toBe('260.000');
  });
});
