import { describe, expect, it } from 'vitest';

import { refreshTokenChanged } from '../scripts/persist-token.js';

describe('refreshTokenChanged', () => {
  it('is true when the saved refresh token differs from the previous one', () => {
    expect(refreshTokenChanged('old-token', { refresh_token: 'new-token' })).toBe(true);
  });

  it('is true when there was no previous token but a new one exists', () => {
    expect(refreshTokenChanged(undefined, { refresh_token: 'new-token' })).toBe(true);
  });

  it('is false when the refresh token is unchanged', () => {
    expect(refreshTokenChanged('same-token', { refresh_token: 'same-token' })).toBe(false);
  });

  it('is false when the saved session has no refresh token', () => {
    expect(refreshTokenChanged('old-token', {})).toBe(false);
    expect(refreshTokenChanged('old-token', undefined)).toBe(false);
  });
});
