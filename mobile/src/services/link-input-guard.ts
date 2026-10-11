import { safeIncomingPath } from './incoming-links';

// Evaluate before expo-router/entry reads the initial browser URL.
if (process.env.EXPO_OS === 'web' && typeof window !== 'undefined' &&
    safeIncomingPath(window.location.href) !== window.location.href) {
  window.history.replaceState(null, '', '/');
}
