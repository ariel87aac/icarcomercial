import { describe, expect, it } from 'vitest';
import { projectedAvailableQuantity } from './inventory-calculations';

describe('projectedAvailableQuantity', () => {
  it('returns the free balance when every confirmed order is covered', () => {
    expect(projectedAvailableQuantity(20, 8, 0)).toBe(12);
  });

  it('keeps the shortage as a negative value when commitments exceed physical stock', () => {
    expect(projectedAvailableQuantity(170, 200, 0)).toBe(-30);
  });

  it('preserves the presentation decimal scale', () => {
    expect(projectedAvailableQuantity(5.25, 5.5, 2)).toBe(-0.25);
  });
});
