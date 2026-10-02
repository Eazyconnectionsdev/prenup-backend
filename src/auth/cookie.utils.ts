const isProd = process.env.NODE_ENV === 'production';

export const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  // no domain: host-only cookie
} as const;

export const cookieOptionsWithMaxAge = (maxAge?: number) => ({
  ...DEFAULT_COOKIE_OPTIONS,
  ...(typeof maxAge === 'number' ? { maxAge } : {}),
});