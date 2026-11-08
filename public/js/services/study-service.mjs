import { words, validateBackup } from '../utils/domain.mjs';
// Study data has one owner; browser storage stays behind StudyRepository.
export class StudyService {
    constructor(repository, hadithService, onStorageError = () => { }) {
        this.repository = repository;
        this.hadithService = hadithService;
        this.onStorageError = onStorageError;
        this.bookmarks = repository.read('bookmarks', []);
        this.progress = repository.read('progress', []);
        this.notes = repository.read('notes', {});
        this.last = repository.read('last', null);
    }
    save(key, value) {
        try {
            this.repository.write(key, value);
            return true;
        }
        catch {
            this.onStorageError();
            return false;
        }
    }
    isSaved(id, word = null) {
        return this.bookmarks.some(b => b.id === id && b.word === word);
    }
    toggleBookmark(id, word = null) {
        const hadith = this.hadithService.getHadith(id);
        if (!hadith || word !== null && !words(hadith)[word])
            return null;
        const existed = this.isSaved(id, word);
        this.bookmarks = existed ? this.bookmarks.filter(b => !(b.id === id && b.word === word)) : [...this.bookmarks, { id, word, date: Date.now() }];
        this.save('bookmarks', this.bookmarks);
        return !existed;
    }
    setProgress(id, state) {
        this.progress = this.progress.filter(p => p.id !== id);
        if (state)
            this.progress.push({ id, state });
        this.save('progress', this.progress);
    }
    saveNote(id, text) {
        this.notes[id] = text;
        return this.save('notes', this.notes);
    }
    remember(id, word = 0) {
        this.last = { id, word, page: this.hadithService.pageFor(id, word) };
        this.save('last', this.last);
    }
    createBackup() {
        return { format: 'arbaeen-reader', version: 1, exportedAt: new Date().toISOString(), bookmarks: this.bookmarks, progress: this.progress, notes: this.notes };
    }
    mergeBackup(value) {
        const data = validateBackup(value);
        for (const b of data.bookmarks)
            if (b.word !== null && b.word >= words(this.hadithService.getHadith(b.id)).length)
                throw Error('موضع الكلمة غير صالح');
        this.bookmarks = [...this.bookmarks, ...data.bookmarks.filter(b => !this.isSaved(b.id, b.word))];
        this.progress = [...this.progress.filter(p => !data.progress.some(x => x.id === p.id)), ...data.progress];
        this.notes = { ...this.notes, ...data.notes };
        return [this.save('bookmarks', this.bookmarks), this.save('progress', this.progress), this.save('notes', this.notes)].every(Boolean);
    }
}
