export class StudyRepository {
    constructor(storage, prefix = 'arbaeen-v1:') {
        this.storage = storage;
        this.prefix = prefix;
    }
    read(key, fallback) {
        try {
            return JSON.parse((this.storage ?? globalThis.localStorage).getItem(this.prefix + key)) ?? fallback;
        }
        catch {
            return fallback;
        }
    }
    write(key, value) {
        (this.storage ?? globalThis.localStorage).setItem(this.prefix + key, JSON.stringify(value));
    }
}
