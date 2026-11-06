// A small promise wrapper over IndexedDB for the offline store (PWA). On the Capacitor shell the same interface is
// backed by SQLite/SQLCipher (ADR-MNT-007); nothing above this file knows which one it talks to.

type Row = { id: string } & Record<string, unknown>;

interface LocalDb {
  all(table: string): Promise<Row[]>;
  put(table: string, rows: Row[]): Promise<void>;
  remove(table: string, ids: string[]): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  close(): void;
}

// 2: CBM rounds (cbmPoints, cbmRoutes)
const VERSION = 2;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

/** One database per person on the device, so a shared floor phone keeps each user's data apart. */
async function openLocalDb(name: string, tables: readonly string[]): Promise<LocalDb> {
  const open = indexedDB.open(name, VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    for (const t of [...tables, "meta"])
      if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
  };
  const db = await req(open);

  return {
    async all(table) {
      return (await req(db.transaction(table).objectStore(table).getAll())) as Row[];
    },
    async put(table, rows) {
      if (rows.length === 0) return;
      const tx = db.transaction(table, "readwrite");
      const store = tx.objectStore(table);
      for (const r of rows) store.put(r);
      await done(tx);
    },
    async remove(table, ids) {
      if (ids.length === 0) return;
      const tx = db.transaction(table, "readwrite");
      const store = tx.objectStore(table);
      for (const id of ids) store.delete(id);
      await done(tx);
    },
    async getMeta<T>(key: string) {
      const row = (await req(db.transaction("meta").objectStore("meta").get(key))) as
        | { id: string; value: T }
        | undefined;
      return row?.value;
    },
    async setMeta(key, value) {
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put({ id: key, value });
      await done(tx);
    },
    close() {
      db.close();
    },
  };
}

/** Wipes a person's local data (logout, or the device revoked by MDM). */
function deleteLocalDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const r = indexedDB.deleteDatabase(name);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

export { deleteLocalDb, openLocalDb };
export type { LocalDb, Row };
