export function validateRounding(rounding = 'floor') {
  if (!['floor', 'half-up'].includes(rounding)) {
    throw new Error('rounding must be floor or half-up');
  }
  return rounding;
}

// Count ratios remain exact until the final bounded two-decimal percentage.
export function percentage(numerator, denominator, rounding) {
  const divisor = BigInt(denominator);
  const adjustment = rounding === 'half-up' ? divisor / 2n : 0n;
  return Number((BigInt(numerator) * 10_000n + adjustment) / divisor) / 100;
}
