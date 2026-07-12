import { describe, it, expect } from 'vitest';
import { sumKg } from './utils';

describe('sumKg', () => {
  it('sums decimal kg values', () => {
    expect(sumKg(['4.6', '4.6', '9.2'])).toBe('18.4');
  });

  it('handles empty array', () => {
    expect(sumKg([])).toBe('0.0');
  });
});
