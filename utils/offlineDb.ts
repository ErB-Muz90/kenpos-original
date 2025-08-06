import { CartItem, Sale } from '../types';

const DB_NAME = 'KenPOS-Offline';
const DB_VERSION = 1;
const CART_STORE = 'cart';
const QUEUE_STORE = 'orderQueue';

let db: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

/**
 * Wraps an IDBRequest in a Promise for easier async/await usage.
 * @param request The IndexedDB request to promisify.
 * @returns A promise that resolves with the request's result or rejects with its error.
 */
function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Initializes the IndexedDB database and creates object stores if needed.
 * This function is idempotent and handles concurrent calls safely.
 * @returns A promise that resolves with the database instance.
 */
export function initDB(): Promise<IDBDatabase> {
    if (db) {
        return Promise.resolve(db);
    }
    if (initPromise) {
        return initPromise;
    }

    console.log('[DB] Initializing IndexedDB...');

    initPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            console.log('[DB] Upgrade needed. Creating object stores...');

            if (!dbInstance.objectStoreNames.contains(CART_STORE)) {
                dbInstance.createObjectStore(CART_STORE, { keyPath: 'id' });
                console.log(`[DB] Created '${CART_STORE}' store.`);
            }
            if (!dbInstance.objectStoreNames.contains(QUEUE_STORE)) {
                const queueStore = dbInstance.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
                queueStore.createIndex('date', 'date', { unique: false });
                console.log(`[DB] Created '${QUEUE_STORE}' store with 'date' index.`);
            }
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[DB] Database opened successfully.');
            db.onclose = () => {
                console.warn('[DB] Database connection closed.');
                db = null; // Reset on close
                initPromise = null;
            };
            resolve(db);
        };

        request.onerror = () => {
            console.error('[DB] Database error:', request.error);
            initPromise = null;
            reject(request.error);
        };
    });
    
    return initPromise;
}

/**
 * Gets an object store from the database within a new transaction.
 * Ensures DB is initialized before proceeding.
 * @param storeName The name of the object store to get.
 * @param mode The transaction mode ('readonly' or 'readwrite').
 * @returns The IDBObjectStore instance.
 */
async function getStore(storeName: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const dbInstance = await initDB();
    const tx = dbInstance.transaction(storeName, mode);
    return tx.objectStore(storeName);
}

// --- Cart Management ---

export async function saveCart(cart: CartItem[]): Promise<void> {
    const store = await getStore(CART_STORE, 'readwrite');
    const clearRequest = store.clear();
    await promisifyRequest(clearRequest);
    for (const item of cart) {
        await promisifyRequest(store.add(item));
    }
    console.log(`[DB] Saved ${cart.length} items to cart store.`);
}


export async function getCart(): Promise<CartItem[]> {
    const store = await getStore(CART_STORE, 'readonly');
    const items = await promisifyRequest(store.getAll());
    console.log(`[DB] Retrieved ${items.length} items from cart.`);
    return items;
}

export async function clearCart(): Promise<void> {
    const store = await getStore(CART_STORE, 'readwrite');
    await promisifyRequest(store.clear());
    console.log('[DB] Cart cleared from IndexedDB.');
}

// --- Offline Order Queue ---

export async function queueOrder(order: Sale): Promise<void> {
    const store = await getStore(QUEUE_STORE, 'readwrite');
    await promisifyRequest(store.add(order));
    console.log(`[DB] Queued order '${order.id}'.`);
}

/**
 * Attempts to sync all pending orders from the queue to the server.
 * Deletes orders from the queue upon successful sync.
 * @returns An object with the count of successful and failed syncs.
 */
export async function syncPendingOrders(): Promise<{ success: number; failed: number }> {
    console.log('[DB] Starting sync of pending orders...');
    if (!navigator.onLine) {
        console.log('[DB] Sync attempt stopped: Offline.');
        return { success: 0, failed: 0 };
    }

    const store = await getStore(QUEUE_STORE, 'readwrite');
    const orders = await promisifyRequest(store.getAll());
    
    if (orders.length === 0) {
        console.log('[DB] No pending orders to sync.');
        return { success: 0, failed: 0 };
    }

    console.log(`[DB] Found ${orders.length} orders to sync.`);
    let successCount = 0;
    let failedCount = 0;

    for (const order of orders) {
        try {
            // In a real app, this would be a fetch call to your backend API.
            // We simulate it here for demonstration purposes.
            console.log(`[DB] Simulating API POST for order '${order.id}'...`);
            const response = await new Promise<Response>(resolve => {
                setTimeout(() => {
                    resolve(new Response(null, { status: 200 })); // Simulate success
                }, 500);
            });

            if (response.ok) {
                // If API call is successful, delete from the queue
                await promisifyRequest(store.delete(order.id));
                console.log(`[DB] Successfully synced and deleted order '${order.id}'.`);
                successCount++;
            } else {
                console.error(`[DB] Failed to sync order '${order.id}'. Server responded with error.`);
                failedCount++;
            }
        } catch (error) {
            console.error(`[DB] Network error while syncing order '${order.id}'.`, error);
            failedCount++;
        }
    }

    console.log(`[DB] Sync finished. Success: ${successCount}, Failed: ${failedCount}.`);
    return { success: successCount, failed: failedCount };
}

export async function getQueuedOrderCount(): Promise<number> {
    const store = await getStore(QUEUE_STORE, 'readonly');
    return promisifyRequest(store.count());
}


// --- Backup & Restore ---

export async function getAllQueuedOrders(): Promise<Sale[]> {
  const store = await getStore(QUEUE_STORE, 'readonly');
  return promisifyRequest(store.getAll());
}

export async function restoreQueue(orders: Sale[]): Promise<void> {
  const store = await getStore(QUEUE_STORE, 'readwrite');
  await promisifyRequest(store.clear());
  for (const order of orders) {
    await promisifyRequest(store.add(order));
  }
  console.log(`[DB] Restored ${orders.length} orders to queue.`);
}

export async function restoreCart(items: CartItem[]): Promise<void> {
    const store = await getStore(CART_STORE, 'readwrite');
    await promisifyRequest(store.clear());
    for (const item of items) {
        await promisifyRequest(store.add(item));
    }
    console.log(`[DB] Restored ${items.length} items to cart.`);
}