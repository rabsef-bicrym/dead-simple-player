// TypeScript does not apply Metro's platform extension lookup. Native is the
// type-checking fallback; Expo selects TuningStatic.web/native at bundle time.
export { TuningStatic } from './TuningStatic.native';
