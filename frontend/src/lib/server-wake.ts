import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

/**
 * Free hosting puts the API to sleep when unused, and the first request then takes up to about a
 * minute. This tracks requests that are still running after SLOW_MS so the UI can explain the wait
 * instead of looking broken.
 */
const SLOW_MS = 4000;

let slowCount = 0;
const listeners = new Set<() => void>();
const timers = new WeakMap<InternalAxiosRequestConfig, { timer: ReturnType<typeof setTimeout>; slow: boolean }>();

const emit = () => listeners.forEach((l) => l());

export function subscribeServerWake(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const isServerWaking = () => slowCount > 0;

function finish(config: InternalAxiosRequestConfig | undefined) {
  const entry = config && timers.get(config);
  if (!entry) return;
  clearTimeout(entry.timer);
  timers.delete(config!);
  if (entry.slow) {
    slowCount--;
    emit();
  }
}

export function trackRequest(api: AxiosInstance) {
  if (typeof window === 'undefined') return;
  api.interceptors.request.use((config) => {
    const entry = {
      slow: false,
      timer: setTimeout(() => {
        entry.slow = true;
        slowCount++;
        emit();
      }, SLOW_MS),
    };
    timers.set(config, entry);
    return config;
  });
  api.interceptors.response.use(
    (res) => {
      finish(res.config);
      return res;
    },
    (err) => {
      finish(err?.config);
      return Promise.reject(err);
    },
  );
}
