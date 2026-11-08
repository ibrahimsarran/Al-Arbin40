import { downloadKey } from '../utils/audio-key.mjs';

export class AudioRepository {
    constructor(indexedDB) {
        this.indexedDB = indexedDB;
        this.dbPromise = null;
    }
    audioDB() {
        return this.dbPromise ??= new Promise((resolve, reject) => {
            if (!(this.indexedDB ?? globalThis.indexedDB))
                return reject(Error('حفظ التسجيلات غير متاح في هذا المتصفح'));
            let blocked = false;
            const request = (this.indexedDB ?? globalThis.indexedDB).open('arbaeen-audio', 2);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('recordings'))
                    db.createObjectStore('recordings', {
                        keyPath: 'id'
                    });
                if (!db.objectStoreNames.contains('downloads'))
                    db.createObjectStore('downloads', {
                        keyPath: 'key'
                    });
            };
            request.onblocked = () => {
                blocked = true;
                this.dbPromise = null;
                reject(Error('أغلق نوافذ التطبيق الأخرى، ثم أعد فتحه لتفعيل التنزيلات.'));
            };
            request.onsuccess = () => {
                const db = request.result;
                if (blocked) {
                    db.close();
                    return;
                }
                db.onversionchange = () => {
                    db.close();
                    this.dbPromise = null;
                };
                resolve(db);
            };
            request.onerror = () => {
                this.dbPromise = null;
                reject(request.error);
            };
        });
    }
    async audioGetAll() {
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('recordings').objectStore('recordings').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async audioPut(id, file) {
        if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|ogg|wav)$/i.test(file.name))
            throw Error('اختر ملفًا صوتيًا');
        if (file.size > 100 * 1024 * 1024)
            throw Error('الحد الأقصى للتسجيل ١٠٠ MB');
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').put({
                id, file, name: file.name
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || Error('تعذّر حفظ التسجيل'));
        });
    }
    async audioDelete(id) {
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('recordings', 'readwrite');
            tx.objectStore('recordings').delete(id);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }
    async downloadGetAll() {
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('downloads'), req = tx.objectStore('downloads').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async downloadPut(row) {
        if (!row || !Number.isInteger(row.id) || row.id < 1 || row.id > 42 || !/^[-a-z0-9]+$/.test(row.readerId) || row.key !== downloadKey(row.readerId, row.id) || !row.file || row.file.size !== row.bytes || row.bytes <= 0 || !/^[a-f0-9]{64}$/.test(row.sha256))
            throw Error('بيانات تنزيل غير صالحة');
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('downloads', 'readwrite');
            tx.objectStore('downloads').put(row);
            tx.oncomplete = () => resolve(row);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || Error('تعذّر حفظ التنزيل'));
        });
    }
    async downloadDelete(keys) {
        const db = await this.audioDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('downloads', 'readwrite'), store = tx.objectStore('downloads');
            for (const key of keys)
                store.delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || Error('تعذّر حذف التنزيل'));
        });
    }
    close() {
        const pending = this.dbPromise;
        this.dbPromise = null;
        return pending?.then(db => db.close()).catch(() => {
        });
    }
}
