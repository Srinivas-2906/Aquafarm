/**
 * Central product configuration — rename product here
 */
export const PRODUCT = {
  name: 'Vijays Farm',
  shortName: 'Aquafarm',
  tagline: 'Feeding & inventory management',
  version: '0.1.0',
} as const;

export const THEME = {
  colors: {
    primary: '#0F5D5E',
    primaryDark: '#0A4546',
    primaryLight: '#DDF2F0',
    accent: '#D99021',
    background: '#F5F7F4',
    surface: '#FFFFFF',
    textPrimary: '#17211F',
    textSecondary: '#5D6966',
    border: '#D9E0DD',
    success: '#27864B',
    warning: '#B66B12',
    danger: '#B83A3A',
    offline: '#6B5CA5',
  },
  spacing: {
    unit: 8,
  },
  touchTarget: 48,
} as const;

export const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  language: 'en' as const,
  usualMealsPerDay: 4,
  lowStockThresholdKg: 100,
  maxLoginAttempts: 5,
  loginLockoutMinutes: 15,
} as const;

export const API_ENV_SCHEMA = {
  DATABASE_URL: 'string',
  API_PORT: 'number',
  JWT_SECRET: 'string',
  JWT_REFRESH_SECRET: 'string',
} as const;
