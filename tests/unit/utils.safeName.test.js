const safeName = require('../../src/utils/safeName');

describe('utils/safeName', () => {
  test('replaces disallowed chars with underscore', () => {
    expect(safeName('a b/c\\d*e?f:g|h"i<j>k')).toBe('a_b_c_d_e_f_g_h_i_j_k');
  });

  test('preserves allowed characters', () => {
    expect(safeName('AZaz09._-')).toBe('AZaz09._-');
  });

  test('handles empty and non-string inputs', () => {
    expect(safeName('')).toBe('');
    expect(safeName(null)).toBe('null');
    expect(safeName(undefined)).toBe('undefined');
    expect(safeName(123)).toBe('123');
  });
});

