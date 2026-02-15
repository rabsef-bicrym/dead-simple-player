/**
 * Dark theme tokens used throughout the app.
 * Palette inspired by Tailwind Zinc with subtle cool undertones
 * for a premium, TV-app feel.
 */
export const colors = {
  // Backgrounds
  background: '#0c0c0f',
  surface: '#161619',
  surfaceLight: '#222226',
  surfaceBright: '#333338',

  // Borders
  border: '#2a2a30',
  borderLight: '#404048',

  // Text
  text: '#f0f0f5',
  textSecondary: '#9898a0',
  textMuted: '#58585f',

  // Accent (blue)
  accent: '#4a9eff',
  accentDim: '#2a6ecc',
  accentGlow: 'rgba(74, 158, 255, 0.12)',

  // Now-playing (green)
  nowPlaying: '#22c55e',
  nowPlayingDim: 'rgba(34, 197, 94, 0.08)',

  // Errors and indicators
  error: '#ef4444',
  timeIndicator: '#ef4444',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Font sizes bumped slightly for couch-distance readability. */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  hero: 40,
} as const;
