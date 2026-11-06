import axios from "axios";
import { toast } from "sonner";

import type { AxiosError } from "axios";

// Extra per-request flags used by the refresh interceptor.
declare module "axios" {
  interface AxiosRequestConfig {
    // Marks the auth probe (GET /api/me). A failed refresh for a probe means
    // "not logged in", not "session expired", so it must not raise the banner.
    authProbe?: boolean;
    // Set once we've already retried a request after a refresh — prevents loops.
    _retried?: boolean;
  }
}

// Same-origin instance; the Vite dev server proxies `/api/*` to the BFF, which
// owns the httpOnly session cookie.
const http = axios.create({ withCredentials: true });

// Tag every outgoing request with a correlation id the backend logs and traces
// end-to-end (browser -> BFF -> core-api). Set only if absent so the same id is
// reused when the response interceptor retries a request after a token refresh.
http.interceptors.request.use((config) => {
  config.headers.set("x-trace-id", config.headers.get("x-trace-id") ?? crypto.randomUUID());
  return config;
});

// A sensitive Master Data change is held for a second person's approval (202): say so wherever it was made.
http.interceptors.response.use((res) => {
  if (
    res.status === 202 &&
    (res.data as { data?: { pendingApproval?: boolean } })?.data?.pendingApproval
  )
    toast.info(
      document.documentElement.lang === "en"
        ? "Sent for approval: the change applies once someone else approves it (Change approval)."
        : "Diajukan untuk persetujuan: perubahan berlaku setelah disetujui orang lain (Persetujuan perubahan).",
      { duration: 7000 },
    );
  return res;
});

// --- session-expired pub/sub ------------------------------------------------
// The interceptor lives outside React, so it broadcasts to subscribers (App)
// instead of touching component state directly.
const sessionExpiredListeners = new Set<() => void>();

function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function emitSessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

// --- token refresh ----------------------------------------------------------
// Concurrent 401s share a single in-flight refresh. Uses bare `axios` (not
// `http`) so the refresh call itself is never intercepted.
let refreshing: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshing ??= axios
    .post("/api/token/refresh", null, { withCredentials: true })
    .then(() => undefined)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config;
    if (error.response?.status !== 401 || !original || original._retried) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      await refreshSession();
    } catch {
      // Refresh failed. For a real data request the user's session lapsed;
      // for the auth probe it just means they were never logged in.
      if (!original.authProbe) emitSessionExpired();
      return Promise.reject(error);
    }

    return http(original);
  },
);

export { http, onSessionExpired };
