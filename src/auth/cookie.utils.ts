const isProd = process.env.NODE_ENV === 'production';
export const COOKIE_DOMAIN = isProd ? '.letsprenup.co.uk' : undefined;


export const DEFAULT_COOKIE_OPTIONS = {
httpOnly: true,
secure: isProd, // require HTTPS in production
sameSite: isProd ? ('none' as const) : ('lax' as const),
domain: COOKIE_DOMAIN,
path: '/',
} as const;


export const cookieOptionsWithMaxAge = (maxAge?: number) => ({
...DEFAULT_COOKIE_OPTIONS,
...(typeof maxAge === 'number' ? { maxAge } : {}),
});