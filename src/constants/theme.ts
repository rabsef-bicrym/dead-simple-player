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

/**
 * Curated palette of muted, TV-friendly category accent colors.
 * Used for left-border color-coding in the guide grid and pills in detail views.
 * Each hue is distinct enough to be differentiable at couch distance.
 */
const CATEGORY_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ef4444', // red
] as const;

/**
 * Deterministic hash of a category name to a color from the palette.
 * Same category always gets the same color across the app.
 */
export function categoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash + category.charCodeAt(i)) | 0;
  }
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length];
}
