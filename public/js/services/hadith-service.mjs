import { words, makePages, pageFor, search, occurrences, takhrijText, normalize } from '../utils/domain.mjs';
// Owns the loaded collection and its stable application pages.
export class HadithService {
    constructor(hadiths = [], commentary = [], glossary = []) {
        this.load(hadiths, commentary, glossary);
    }
    load(hadiths, commentary = [], glossary = []) {
        this.commentary = commentary;
        this.glossary = glossary;
        this.hadiths = hadiths;
        this.pages = makePages(hadiths);
    }
    getHadith(id) {
        return this.hadiths.find(h => h.id === Number(id));
    }
    search(query, hadiths = this.hadiths, options) {
        const q = normalize(query).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
        if (!q)
            return [];
        const direct = search(hadiths, q, options), byId = new Map(direct.map(row => [row.hadith.id, row]));
        if (/^\d+$/.test(q))
            return direct;
        const tokens = q.split(/\s+/);
        for (const h of hadiths) {
            const c = this.commentary.find(c => c.id === h.id), g = this.glossary.filter(g => g.id === h.id);
            const indexed = normalize(h.title + ' ' + h.text + ' ' + (c?.text || '') + ' ' + g.map(x => x.keys.join(' ') + ' ' + x.text).join(' '));
            if (tokens.every(t => indexed.includes(t)) && !byId.has(h.id))
                byId.set(h.id, { hadith: h, matches: [], evidence: g.find(row => tokens.every(t => normalize(row.keys.join(' ') + ' ' + row.text).includes(t))) || c });
        }
        return [...byId.values()].sort((a, b) => a.hadith.id - b.hadith.id);
    }
    occurrences(word) {
        return occurrences(this.hadiths, word);
    }
    pageFor(id, word = 0) {
        return pageFor(this.pages, id, word);
    }
    words(id) {
        return words(this.getHadith(id));
    }
    takhrijText(hadith) {
        return takhrijText(hadith);
    }
}
