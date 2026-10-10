import type { EvaluationRecord } from '../types/editor';

const DB = 'deaify-evaluation-v1';
const STORE = 'records';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = callback(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction failed')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
  });
}

/** Only ground-truth label, filename, model scores and time are stored; NEVER image bytes. */
export const evaluationStore = {
  list: () => transact<EvaluationRecord[]>('readonly', store => store.getAll()),
  add: (record: EvaluationRecord) => transact<IDBValidKey>('readwrite', store => store.add(record)),
  clear: () => transact<undefined>('readwrite', store => store.clear()),
};
