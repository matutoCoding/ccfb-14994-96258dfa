// IndexedDB 本地存储：病例与瓷粉库
import type { CaseRecord, Porcelain } from '../types'

const DB_NAME = 'porcelain-studio'
const DB_VERSION = 1
const STORE_CASES = 'cases'
const STORE_PORCELAINS = 'porcelains'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_CASES)) {
        const s = db.createObjectStore(STORE_CASES, { keyPath: 'id' })
        s.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORE_PORCELAINS)) {
        db.createObjectStore(STORE_PORCELAINS, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

export async function getAllCases(): Promise<CaseRecord[]> {
  const list = await tx(STORE_CASES, 'readonly', (s) => s.getAll() as IDBRequest<CaseRecord[]>)
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveCase(record: CaseRecord): Promise<void> {
  record.updatedAt = Date.now()
  await tx(STORE_CASES, 'readwrite', (s) => s.put(record) as IDBRequest<IDBValidKey>)
}

export async function deleteCase(id: string): Promise<void> {
  await tx(STORE_CASES, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}

export async function getAllPorcelains(): Promise<Porcelain[]> {
  return tx(STORE_PORCELAINS, 'readonly', (s) => s.getAll() as IDBRequest<Porcelain[]>)
}

export async function savePorcelain(p: Porcelain): Promise<void> {
  await tx(STORE_PORCELAINS, 'readwrite', (s) => s.put(p) as IDBRequest<IDBValidKey>)
}

export async function deletePorcelain(id: string): Promise<void> {
  await tx(STORE_PORCELAINS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
}

export async function bulkPutPorcelains(list: Porcelain[]): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_PORCELAINS, 'readwrite')
    const store = t.objectStore(STORE_PORCELAINS)
    list.forEach((p) => store.put(p))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}
