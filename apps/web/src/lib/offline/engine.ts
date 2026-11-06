import { useMemo, useSyncExternalStore } from "react";
import { isAxiosError } from "axios";

import { http } from "@/lib/http";
import { deleteLocalDb, openLocalDb, type LocalDb, type Row } from "@/lib/offline/idb";
import { ulid } from "@/lib/offline/ulid";

// The technician app's offline engine (Product Foundation · Offline & sync). Offline is the default, not a mode:
// every screen reads and writes the local store; the network is only used here, in the background.
//
//   write  → apply to the local store at once (optimistic) + append a numbered mutation to the outbox
//   sync   → push the outbox in order (each mutation once, by its ULID), then pull every table since its cursor
//   result → applied: the server's rows replace the optimistic ones on the pull
//            rejected (missing data / rights) or review (clash with newer server state): the work order is
//            reloaded from the server and the mutation is listed under "Needs attention"

const API = "/api/proxy/api/v1";

const TABLES = [
  "assets",
  "profiles",
  "meters",
  "failureCodes",
  "workOrders",
  "steps",
  "labour",
  "parts",
  "materials",
  "requests",
  "stores",
  "bins",
  "items",
  "stock",
  "counts",
  "cbmPoints",
  "cbmRoutes",
  "reviews",
  "outbox",
  "attention",
] as const;
type Table = (typeof TABLES)[number];

type MutationKind =
  | "wo.action"
  | "wo.update"
  | "wo.labour"
  | "wo.step"
  | "wo.issue"
  | "meter.reading"
  | "request.create"
  | "count.line"
  | "cbm.reading";
type Mutation = {
  id: string;
  kind: MutationKind;
  entityId?: string;
  payload: Record<string, unknown>;
  at: string;
};
type Attention = Mutation & { result: "rejected" | "review"; message: string; seenAt: string };
type Access = {
  userId: string;
  userName: string;
  permissions: string[];
  modules: string[];
  billing: string | null;
};
type Identity = { sub: string; preferredUsername: string };
type Status = "starting" | "online" | "syncing" | "offline" | "signed-out";

const DEVICE_KEY = "mam-device-id";
const IDENTITY_KEY = "mam-last-identity";
const EVERY_MS = 20_000;
// a weak signal that never answers counts as no signal
const TIMEOUT_MS = 20_000;
const TARGET: Record<string, string> = {
  start: "in_progress",
  hold: "on_hold",
  resume: "in_progress",
  complete: "completed",
};

const deviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "web-ephemeral";
  }
};

/** Network trouble (no signal, server or proxy down) as opposed to an answer from the server. */
const unreachable = (err: unknown) =>
  !isAxiosError(err) ||
  !err.response ||
  err.response.status >= 500 ||
  err.code === "ERR_NETWORK" ||
  err.code === "ECONNABORTED";

class OfflineEngine {
  private db: LocalDb | null = null;
  private dbName = "";
  private data = Object.fromEntries(TABLES.map((t) => [t, new Map<string, Row>()])) as Record<
    Table,
    Map<string, Row>
  >;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  version = 0;
  status: Status = "starting";
  access: Access | null = null;
  identity: Identity | null = null;
  cursors: Record<string, string> = {};
  lastSyncAt: string | null = null;
  lastError = "";
  clockOffsetMs = 0;

  // ---- lifecycle -----------------------------------------------------------------------------------------
  /** Opens the person's local store (from the last sign-in when there is no signal) and starts syncing. */
  async open(identity: Identity) {
    if (this.identity?.sub === identity.sub && this.db) return;
    this.close();
    this.identity = identity;
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch {
      // private mode: the app still works, it just cannot start without signal next time
    }
    this.dbName = `molca-mam-${identity.sub}`;
    this.db = await openLocalDb(this.dbName, TABLES);
    for (const t of TABLES) {
      const rows = await this.db.all(t);
      this.data[t] = new Map(rows.map((r) => [r.id, r]));
    }
    this.cursors = (await this.db.getMeta<Record<string, string>>("cursors")) ?? {};
    this.access = (await this.db.getMeta<Access>("access")) ?? null;
    this.lastSyncAt = (await this.db.getMeta<string>("lastSyncAt")) ?? null;
    this.status = "offline";
    this.bump();
    this.timer = setInterval(() => void this.sync(), EVERY_MS);
    window.addEventListener("online", this.onOnline);
    void this.sync();
  }

  private onOnline = () => void this.sync();

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener("online", this.onOnline);
    this.db?.close();
    this.db = null;
  }

  /** Logout or device revoked: the person's local data goes with them. */
  async wipe() {
    const name = this.dbName;
    this.close();
    for (const t of TABLES) this.data[t].clear();
    this.identity = null;
    this.access = null;
    try {
      localStorage.removeItem(IDENTITY_KEY);
    } catch {
      // nothing to forget
    }
    if (name) await deleteLocalDb(name);
    this.bump();
  }

  static lastIdentity(): Identity | null {
    try {
      const raw = localStorage.getItem(IDENTITY_KEY);
      return raw ? (JSON.parse(raw) as Identity) : null;
    } catch {
      return null;
    }
  }

  // ---- reading -------------------------------------------------------------------------------------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  rows<T = Row>(table: Table): T[] {
    return [...this.data[table].values()] as T[];
  }
  get<T = Row>(table: Table, id: string): T | undefined {
    return this.data[table].get(id) as T | undefined;
  }
  get pending() {
    return this.data.outbox.size;
  }
  can(feature: string, action: string) {
    return !!this.access?.permissions.includes(`maintenance:${feature}:tenant:${action}`);
  }

  // ---- writing -------------------------------------------------------------------------------------------
  /** Records a change on the device now, and queues it for the server. Never waits for the network. */
  async enqueue(
    kind: MutationKind,
    entityId: string | undefined,
    payload: Record<string, unknown>,
  ) {
    const m: Mutation = { id: ulid(), kind, entityId, payload, at: new Date().toISOString() };
    const touched = this.applyLocal(m);
    this.data.outbox.set(m.id, m as unknown as Row);
    await this.persist(touched);
    await this.db?.put("outbox", [m as unknown as Row]);
    this.bump();
    setTimeout(() => void this.sync(), 300);
    return m;
  }

  /** The optimistic change on the local store; returns the rows it touched to persist. */
  private applyLocal(m: Mutation): [Table, Row][] {
    const p = m.payload;
    const me = this.access?.userName ?? this.identity?.preferredUsername ?? "me";
    const set = (t: Table, row: Row): [Table, Row] => {
      this.data[t].set(row.id, row);
      return [t, row];
    };
    switch (m.kind) {
      case "wo.action": {
        const wo = this.data.workOrders.get(m.entityId ?? "");
        if (!wo) return [];
        const to = TARGET[String(p.action)];
        if (!to) return [];
        return [
          set("workOrders", {
            ...wo,
            state: to,
            startedAt: wo.startedAt ?? (to === "in_progress" ? m.at : null),
            completedAt: to === "completed" ? m.at : wo.completedAt,
            holdReason: to === "on_hold" ? p.reason : null,
            __pending: true,
          }),
        ];
      }
      case "wo.update": {
        const wo = this.data.workOrders.get(m.entityId ?? "");
        if (!wo) return [];
        const { base: _b, ...fields } = p;
        return [set("workOrders", { ...wo, ...fields, __pending: true })];
      }
      case "wo.step": {
        const step = this.data.steps.get(String(p.stepId));
        if (!step) return [];
        return [
          set("steps", {
            ...step,
            done: !!p.done,
            value: typeof p.value === "number" ? String(p.value) : null,
            __pending: true,
          }),
        ];
      }
      case "wo.labour":
        return [
          set("labour", {
            id: m.id,
            __mutationId: m.id,
            workOrderId: m.entityId,
            personName: me,
            hours: String(p.hours),
            workDate: p.workDate,
            note: "",
          }),
        ];
      case "wo.issue": {
        const item = this.data.items.get(String(p.itemId));
        return [
          set("parts", {
            id: m.id,
            __mutationId: m.id,
            workOrderId: m.entityId,
            itemId: p.itemId,
            itemCode: item?.code ?? "",
            description: item?.name ?? "part",
            quantity: String(p.quantity),
            uom: item?.uom ?? "pcs",
          }),
        ];
      }
      case "meter.reading": {
        const meter = this.data.meters.get(m.entityId ?? "");
        return meter
          ? [set("meters", { ...meter, __pendingValue: p.value, __pendingAt: m.at })]
          : [];
      }
      case "request.create":
        return [
          set("requests", {
            id: m.id,
            __mutationId: m.id,
            number: "not sent yet",
            assetId: p.assetId,
            assetTag: this.assetTag(String(p.assetId)),
            symptom: p.symptom,
            machineStopped: !!p.machineStopped,
            reportedAt: m.at,
            status: "open",
          }),
        ];
      case "cbm.reading": {
        // the point shows the new value at once; the server judges it again (and raises alarms) on sync
        const pt = this.data.cbmPoints.get(String(p.pointId));
        if (!pt) return [];
        return [
          set("cbmPoints", {
            ...pt,
            lastValue: String(p.value),
            lastAt: m.at,
            status: String(p.status ?? pt.status),
          }),
        ];
      }
      default:
        return [];
    }
  }

  private assetTag(id: string) {
    const tag = this.data.assets.get(id)?.tag;
    return typeof tag === "string" ? tag : "";
  }

  private async persist(rows: [Table, Row][]) {
    const by = new Map<Table, Row[]>();
    for (const [t, r] of rows) by.set(t, [...(by.get(t) ?? []), r]);
    for (const [t, list] of by) await this.db?.put(t, list);
  }

  dismiss(attentionId: string) {
    this.data.attention.delete(attentionId);
    void this.db?.remove("attention", [attentionId]);
    this.bump();
  }

  // ---- syncing -------------------------------------------------------------------------------------------
  /** Push then pull. One run at a time; a run while offline just notes it and waits for the next tick. */
  sync(): Promise<void> {
    if (!this.db) return Promise.resolve();
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.status = "offline";
      this.bump();
      return;
    }
    this.status = "syncing";
    this.bump();
    try {
      await this.push();
      await this.pull();
      this.status = "online";
      this.lastError = "";
      this.lastSyncAt = new Date().toISOString();
      await this.db?.setMeta("lastSyncAt", this.lastSyncAt);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) this.status = "signed-out";
      else this.status = unreachable(err) ? "offline" : "online";
      this.lastError = err instanceof Error ? err.message : String(err);
    }
    this.bump();
  }

  private async push() {
    const outbox = this.rows<Mutation>("outbox").sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < outbox.length; i += 100) {
      const batch = outbox.slice(i, i + 100);
      const { data } = await http.post<{
        data: {
          serverTime: string;
          offsetMs: number;
          results: { id: string; result: string; message: string; entityId?: string | null }[];
        };
      }>(
        `${API}/sync/push`,
        { deviceId: deviceId(), deviceNow: new Date().toISOString(), mutations: batch },
        { timeout: TIMEOUT_MS },
      );
      this.clockOffsetMs = data.data.offsetMs;
      const reload = new Set<string>();
      const done: string[] = [];
      const optimistic: [Table, string][] = [];
      let stop = false;
      for (const r of data.data.results) {
        const m = this.data.outbox.get(r.id) as unknown as Mutation | undefined;
        if (!m) continue;
        if (r.result === "retry") {
          stop = true;
          break;
        }
        done.push(m.id);
        for (const t of ["labour", "parts", "requests"] as const)
          if (this.data[t].has(m.id)) optimistic.push([t, m.id]);
        if (m.kind === "meter.reading" && m.entityId) {
          const meter = this.data.meters.get(m.entityId);
          if (meter) {
            const { __pendingValue: _v, __pendingAt: _a, ...rest } = meter;
            this.data.meters.set(meter.id, rest as Row);
            await this.db?.put("meters", [rest as Row]);
          }
        }
        if (r.result !== "applied") {
          const a: Attention = {
            ...m,
            result: r.result as Attention["result"],
            message: r.message,
            seenAt: new Date().toISOString(),
          };
          this.data.attention.set(m.id, a as unknown as Row);
          await this.db?.put("attention", [a as unknown as Row]);
          if (m.kind.startsWith("wo.") && m.entityId) reload.add(m.entityId);
        }
      }
      for (const [t, id] of optimistic) this.data[t].delete(id);
      for (const t of ["labour", "parts", "requests"] as const)
        await this.db?.remove(
          t,
          optimistic.filter(([x]) => x === t).map(([, id]) => id),
        );
      for (const id of done) this.data.outbox.delete(id);
      await this.db?.remove("outbox", done);
      // the server did not take the change: show the work order as the server has it
      for (const id of reload) await this.reloadWorkOrder(id);
      this.bump();
      if (stop) throw new Error("the server asked to retry later");
    }
  }

  private async reloadWorkOrder(id: string) {
    try {
      const { data } = await http.get<{
        data: { workOrder: Row; steps: Row[]; labour: Row[]; parts: Row[] };
      }>(`${API}/work-orders/${id}`, { timeout: TIMEOUT_MS });
      const d = data.data;
      await this.upsert("workOrders", [
        { ...d.workOrder, __serverActionTaken: d.workOrder.actionTaken },
      ]);
      await this.upsert("steps", d.steps);
      await this.upsert("labour", d.labour);
      await this.upsert("parts", d.parts);
    } catch {
      // the next pull brings it
    }
  }

  private async upsert(t: Table, rows: Row[]) {
    for (const r of rows) this.data[t].set(r.id, r);
    await this.db?.put(t, rows);
  }

  private async pull() {
    for (let round = 0; round < 20; round++) {
      const { data } = await http.post<{
        data: {
          cursors: Record<string, string>;
          more: boolean;
          changes: Record<string, Row[]>;
          access: Access;
        };
      }>(`${API}/sync/pull`, { cursors: this.cursors }, { timeout: TIMEOUT_MS });
      const { changes, cursors, more, access } = data.data;
      for (const [t, rows] of Object.entries(changes)) {
        if (!(TABLES as readonly string[]).includes(t)) continue;
        // keep what the server last said a work order's notes were: the base for merging offline edits
        const list = t === "workOrders" ? rows.map((r) => this.keepPending(r)) : rows;
        await this.upsert(t as Table, list);
      }
      this.cursors = cursors;
      this.access = access;
      await this.db?.setMeta("cursors", cursors);
      await this.db?.setMeta("access", access);
      this.bump();
      if (!more) return;
    }
  }

  /** A pulled work order with a change still in the outbox keeps the local (newer) fields on top. */
  private keepPending(server: Row): Row {
    const withBase = { ...server, __serverActionTaken: server.actionTaken };
    const queued = this.rows<Mutation>("outbox").filter(
      (m) => m.entityId === server.id && (m.kind === "wo.action" || m.kind === "wo.update"),
    );
    if (queued.length === 0) return withBase;
    let row: Row = withBase;
    for (const m of queued.sort((a, b) => a.id.localeCompare(b.id))) {
      if (m.kind === "wo.action" && TARGET[String(m.payload.action)])
        row = { ...row, state: TARGET[String(m.payload.action)], __pending: true };
      if (m.kind === "wo.update") {
        const { base: _b, ...fields } = m.payload;
        row = { ...row, ...fields, __pending: true };
      }
    }
    return row;
  }
}

const engine = new OfflineEngine();

/**
 * A snapshot of the engine for components, new on every local change or sync step. The engine itself is one
 * mutable object; handing components that same reference would let memoisation (React Compiler) keep stale
 * values, so each version gets its own view with the methods bound to the engine.
 */
function useOffline() {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);
  return useMemo(
    () => ({
      version,
      status: engine.status,
      access: engine.access,
      identity: engine.identity,
      lastSyncAt: engine.lastSyncAt,
      lastError: engine.lastError,
      pending: engine.pending,
      rows: engine.rows.bind(engine),
      get: engine.get.bind(engine),
      can: engine.can.bind(engine),
      enqueue: engine.enqueue.bind(engine),
      sync: engine.sync.bind(engine),
      dismiss: engine.dismiss.bind(engine),
    }),
    [version],
  );
}

export { OfflineEngine, engine, useOffline };
export type { Access, Attention, Identity, Mutation, MutationKind, Status };
