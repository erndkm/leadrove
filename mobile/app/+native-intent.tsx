import { safeIncomingPath } from '../src/services/incoming-links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return safeIncomingPath(path);
}
