/**
 * Storage adapter: the only module that knows about localStorage.
 * Implements the storage port consumed by js/task-store.js.
 */

export const STORAGE_KEY = 'taskadmin.tasks.v1';

/**
 * @param {Storage} [storageArea]
 * @returns {{ read: () => string | null, write: (value: string) => void, clear: () => void }}
 */
export function createLocalStoragePort(storageArea) {
  const area = storageArea ?? globalThis.localStorage;

  return {
    read() {
      // Missing or blocked storage is treated as "no tasks yet".
      try {
        return area.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    },

    write(value) {
      // QuotaExceededError and SecurityError propagate to the caller.
      area.setItem(STORAGE_KEY, value);
    },

    clear() {
      area.removeItem(STORAGE_KEY);
    },
  };
}
