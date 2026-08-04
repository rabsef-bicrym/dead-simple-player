// TypeScript does not apply Metro's platform extension lookup. Native is the
// type-checking fallback; Expo selects PlayerSurface.web/native at bundle time.
export { PlayerSurface } from './PlayerSurface.native';
