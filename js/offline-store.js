// IndexedDB-backed offline queue — survives page reloads.
// Stores a single "pending" snapshot of todos that failed to sync.
const OfflineStore = (() => {
    const DB_NAME = 'todo-app-db';
    const DB_VERSION = 1;
    const STORE = 'sync';

    function open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) {
                    req.result.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function withStore(mode, fn) {
        return open().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const store = tx.objectStore(STORE);
            fn(store, resolve, reject);
            tx.oncomplete = () => { db.close(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        }));
    }

    return {
        save(data) {
            return withStore('readwrite', (store, resolve, reject) => {
                try {
                    store.put(data, 'pending');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        },
        load() {
            return withStore('readonly', (store, resolve, reject) => {
                const req = store.get('pending');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        },
        clear() {
            return withStore('readwrite', (store, resolve, reject) => {
                try {
                    store.delete('pending');
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
        }
    };
})();