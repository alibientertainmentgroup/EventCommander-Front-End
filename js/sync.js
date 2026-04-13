// Offline storage and sync helpers using IndexedDB
const offlineStore = (() => {
    const DB_NAME = 'eventCommanderOffline';
    const DB_VERSION = 1;
    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('roster')) db.createObjectStore('roster');
                if (!db.objectStoreNames.contains('accommodations')) db.createObjectStore('accommodations');
                if (!db.objectStoreNames.contains('allergies')) db.createObjectStore('allergies');
                if (!db.objectStoreNames.contains('stations')) db.createObjectStore('stations');
                if (!db.objectStoreNames.contains('pending_checkins')) db.createObjectStore('pending_checkins', { keyPath: 'id', autoIncrement: true });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    async function put(store, key, value) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function get(store, key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function cacheEventData(eventId, data) {
        await Promise.all([
            put('roster', eventId, data.roster || []),
            put('accommodations', eventId, data.accommodations || []),
            put('allergies', eventId, data.allergies || []),
            put('stations', eventId, data.stations || [])
        ]);
    }

    async function getCachedProfile(eventId, capId) {
        const roster = (await get('roster', eventId)) || [];
        const accommodations = (await get('accommodations', eventId)) || [];
        const allergies = (await get('allergies', eventId)) || [];
        const match = roster.find(r => String(r.cap_id) === String(capId));
        const ac = accommodations.filter(r => String(r.cap_id) === String(capId));
        const al = allergies.filter(r => String(r.cap_id) === String(capId));
        return { roster: match || null, accommodations: ac, allergies: al };
    }

    async function getCachedStations(eventId) {
        return (await get('stations', eventId)) || [];
    }

    async function addPendingCheckin(stationId, personnelId, checkedInBy, eventId) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pending_checkins', 'readwrite');
            tx.objectStore('pending_checkins').add({
                stationId,
                personnelId,
                checkedInBy,
                eventId,
                created_at: new Date().toISOString()
            });
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getPendingCheckins() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pending_checkins', 'readonly');
            const req = tx.objectStore('pending_checkins').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function removePendingCheckin(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('pending_checkins', 'readwrite');
            tx.objectStore('pending_checkins').delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    return {
        cacheEventData,
        getCachedProfile,
        getCachedStations,
        addPendingCheckin,
        getPendingCheckins,
        removePendingCheckin
    };
})();

window.offlineStore = offlineStore;
