import { isAxiosError } from "axios";

import { http } from "@/lib/http";
import { engine } from "@/lib/offline/engine";
import { getRegistry } from "@/lib/md";

import type {
  Access,
  AssetDetail,
  AssetProfile,
  AssetTree,
  FailureCode,
  Me,
  Meter,
  MeterReading,
  ProfileInput,
  WebResponse,
} from "@/lib/types";

// The MAM API sits behind the BFF proxy at /api/proxy/api/v1/*; the BFF adds the person's bearer token.
const API = "/api/proxy/api/v1";

// Returns the current user, or null when not authenticated.
async function getMe(): Promise<Me | null> {
  try {
    const { data } = await http.get<WebResponse<Me>>("/api/me", { authProbe: true });
    return data.data;
  } catch (err) {
    if (isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
      return null;
    }
    throw err;
  }
}

function unwrap<T>(body: WebResponse<T>, what: string): T {
  if (body.data == null) throw new Error(body.error ?? `${what} unavailable`);
  return body.data;
}

/** The API's error text (`{ error }`), or the transport message. */
function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const body = err.response?.data as { error?: unknown } | undefined;
    if (typeof body?.error === "string") return body.error;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Master Data has no access endpoint: the API enforces permissions on every write. The web shows everything to
 * a signed-in person and lets the API refuse; the licence block is not used here.
 */
async function getAccess(): Promise<Access> {
  const me = await getMe();
  return {
    tenantId: "",
    userId: me?.sub ?? "",
    userName: me?.preferredUsername ?? "",
    permissions: ["*"],
    licence: null,
  };
}

/** The hierarchy with the assets placed on each work unit, joined from the Master Data endpoints (lib/md). */
async function getAssetTree(): Promise<AssetTree> {
  return (await getRegistry()).tree;
}

async function getAssetDetail(assetId: string): Promise<AssetDetail> {
  const { data } = await http.get<WebResponse<AssetDetail>>(
    `${API}/assets/${encodeURIComponent(assetId)}`,
  );
  return unwrap(data, "asset");
}

async function saveProfile(assetId: string, input: ProfileInput): Promise<AssetProfile> {
  const { data } = await http.put<WebResponse<AssetProfile>>(
    `${API}/assets/${encodeURIComponent(assetId)}/profile`,
    input,
  );
  return unwrap(data, "profile");
}

async function addMeter(assetId: string, input: { kind: string; unit: string }): Promise<Meter> {
  const { data } = await http.post<WebResponse<Meter>>(
    `${API}/assets/${encodeURIComponent(assetId)}/meters`,
    input,
  );
  return unwrap(data, "meter");
}

async function updateMeter(
  meterId: string,
  input: { unit?: string; source?: string },
): Promise<Meter> {
  const { data } = await http.patch<WebResponse<Meter>>(
    `${API}/meters/${encodeURIComponent(meterId)}`,
    input,
  );
  return unwrap(data, "meter");
}

async function deleteMeter(meterId: string): Promise<{ deleted: boolean }> {
  const { data } = await http.delete<WebResponse<{ deleted: boolean }>>(
    `${API}/meters/${encodeURIComponent(meterId)}`,
  );
  return unwrap(data, "meter");
}

async function addReading(
  meterId: string,
  input: { value: number; readAt?: string; note?: string; correctsId?: string },
): Promise<MeterReading> {
  const { data } = await http.post<WebResponse<MeterReading>>(
    `${API}/meters/${encodeURIComponent(meterId)}/readings`,
    input,
  );
  return unwrap(data, "reading");
}

async function getFailureCodes(iso14224Class?: string): Promise<FailureCode[]> {
  const { data } = await http.get<WebResponse<FailureCode[]>>(`${API}/failure-codes`, {
    params: iso14224Class ? { class: iso14224Class } : {},
  });
  return unwrap(data, "failure codes");
}

// Full-page navigations: the BFF responds with redirects (to the IdP / back to
// the app), so these must not go through axios — and must never become router
// <Link>s or navigate() calls either, since a client-side navigation cannot
// follow a cross-origin 302.
function login(returnTo = "/"): void {
  globalThis.location.href = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;
}

// Demo role switch (BFF dev mode only): the personas, one demo person per role; null when the BFF has none
// (production), so the menu entry does not exist there.
async function devPersonas(): Promise<string[] | null> {
  const res = await fetch("/api/dev/personas", { credentials: "same-origin" }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { data: { personas: string[] } }).data.personas;
}

async function switchPersona(username: string): Promise<void> {
  const res = await fetch("/api/dev/switch", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) throw new Error(`switch failed (${res.status})`);
  // a new person: every cached query and screen starts over
  globalThis.location.href = "/";
}

async function logout(): Promise<void> {
  // the person's offline data leaves the device with them (shared floor phones)
  await engine.wipe().catch(() => undefined);
  globalThis.location.href = "/api/logout";
}

export {
  devPersonas,
  switchPersona,
  addMeter,
  addReading,
  deleteMeter,
  updateMeter,
  errorMessage,
  getAccess,
  getAssetDetail,
  getAssetTree,
  getFailureCodes,
  getMe,
  login,
  logout,
  saveProfile,
};
