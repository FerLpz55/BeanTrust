import { describe, expect, it } from 'vitest';

import { resolverApiUrl } from '@/src/config';

describe('config · resolución de la URL de API', () => {
  it('usa localhost solo en desarrollo', () => {
    expect(resolverApiUrl(undefined, true)).toBe('http://localhost:8000');
  });

  it('un build no-dev sin EXPO_PUBLIC_API_URL falla', () => {
    expect(() => resolverApiUrl(undefined, false)).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() => resolverApiUrl('   ', false)).toThrow(/EXPO_PUBLIC_API_URL/);
  });

  it('un build no-dev con HTTP falla', () => {
    expect(() => resolverApiUrl('http://api.example.com', false)).toThrow(/HTTPS/);
  });

  it('acepta HTTPS fuera de desarrollo', () => {
    expect(resolverApiUrl('https://beantrust-api.vercel.app', false)).toBe(
      'https://beantrust-api.vercel.app'
    );
  });
});
