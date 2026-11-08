export class HadithRepository {
    constructor(fetcher = (...args) => globalThis.fetch(...args)) {
        this.fetcher = fetcher;
    }
    async loadContent() {
        const responses = await Promise.all(['hadiths.json', 'commentary.json', 'glossary.json', 'audio-catalog.json', 'word-timings.json', 'word-meanings.json', 'grammar-notes.json'].map(x => this.fetcher(x)));
        if (responses.some(x => !x.ok))
            throw Error('تعذّر تحميل ملفات المحتوى');
        const [hadiths, commentary, glossary, audioCatalog, wordTimings, wordMeanings, grammarNotes] = await Promise.all(responses.map(x => x.json()));
        const readerTimings = new Map([[audioCatalog.id || 'alnufais', wordTimings]]);
        await Promise.all((audioCatalog.alternatives || []).map(async (c) => {
            const r = await this.fetcher(c.timingFile);
            if (!r.ok)
                throw Error('تعذّر تحميل توقيتات الصوت');
            readerTimings.set(c.id, await r.json());
        }));
        return {
            hadiths, commentary, glossary, audioCatalog, wordTimings, readerTimings, wordMeanings, grammarNotes
        };
    }
}
