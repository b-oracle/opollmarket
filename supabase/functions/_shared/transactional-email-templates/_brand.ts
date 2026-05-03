// Shared brand tokens for transactional email templates.
// Keep these in sync with src/index.css (HSL values converted to hex).

export const BRAND = {
  siteName: 'opollmarket',
  siteUrl: 'https://opollmarket.com',
  // Core palette
  primary: '#0F172A', // slate-900
  primaryFg: '#FFFFFF',
  accent: '#10B981', // emerald-500 (wins / positive)
  danger: '#EF4444', // red-500 (loss / rejection)
  warning: '#F59E0B', // amber-500 (expired / pending)
  info: '#3B82F6', // blue-500
  // Surfaces
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  // Text
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#94A3B8',
} as const

export const fmtUSD = (n: number | undefined | null): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  return `$${v.toFixed(2)}`
}

export const fmtSigned = (n: number | undefined | null): string => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0
  const sign = v >= 0 ? '+' : '-'
  return `${sign}$${Math.abs(v).toFixed(2)}`
}
