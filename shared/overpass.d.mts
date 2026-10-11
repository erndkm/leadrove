export const DEFAULT_OVERPASS_ENDPOINTS: string[];
export type OverpassResponse = { elements: unknown[]; remark?: string };
export function createOverpassClient(options?: {
  endpoints?: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (delay: number, signal?: AbortSignal) => Promise<void>;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
}): (query: string, signal?: AbortSignal) => Promise<OverpassResponse>;
