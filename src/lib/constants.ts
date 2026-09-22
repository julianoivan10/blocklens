export const AUTH_COOKIE_NAME = 'blocklens-session';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const SESSION_EXPIRY_DAYS = 30;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const BCRYPT_SALT_ROUNDS = 12;
export const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
export const RESET_TOKEN_EXPIRY_HOURS = 1;

export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  dashboard: '/dashboard',
  research: '/research',
  watchlist: '/watchlist',
  news: '/news',
  settings: '/settings',
  portfolio: '/portfolio',
  wallets: '/portfolio/wallets',
  transactions: '/portfolio/transactions',
  alerts: '/alerts',
} as const;

export const API_ROUTES = {
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    session: '/api/auth/session',
    verifyEmail: '/api/auth/verify-email',
    forgotPassword: '/api/auth/forgot-password',
    resetPassword: '/api/auth/reset-password',
  },
  search: '/api/search',
  watchlist: '/api/watchlist',
  research: '/api/research',
} as const;
