import { findSourcePassages } from '../public/js/utils/source-search.mjs';
import { findMeaningMatches } from './meaning-search.mjs';
const TRUSTED_DOMAINS = ['shamela.ws', 'hadeethenc.com', 'dorar.net', 'binbaz.org.sa', 'binothaimeen.net'];
// Holds the trusted corpus and retrieves complete sections by hadith identity.
export class EvidenceRepository {
    constructor(data) { this.data = data; }
    static isTrustedUrl(value) {
        try {
            const u = new URL(value);
            return u.protocol === 'https:' && TRUSTED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
        }
        catch {
            return false;
        }
    }
    build(question = '') {
        const { hadiths, commentary, glossary, commentaryPages = [] } = this.data;
        if (hadiths.length !== 42 || new Set(hadiths.map(h => h.id)).size !== 42)
            throw Error('Corpus must cover all 42 hadith');
        const references = new Map();
        const corpus = hadiths.map(h => {
            references.set('H' + h.id, { id: 'H' + h.id, hadithId: h.id, title: `الحديث ${h.id} — ${h.title} (المتن والتخريج)`, url: h.source, kind: 'text', excerpt: h.text });
            const c = commentary.find(c => c.id === h.id);
            if (c && EvidenceRepository.isTrustedUrl(c.source))
                references.set('C' + h.id, { id: 'C' + h.id, hadithId: h.id, title: `شرح ابن دقيق العيد — الحديث ${h.id}`, url: c.source, kind: 'commentary', excerpt: c.text });
            const meanings = glossary.filter(g => g.id === h.id && EvidenceRepository.isTrustedUrl(g.source));
            meanings.forEach((g, i) => references.set(`G${h.id}-${i}`, { id: `G${h.id}-${i}`, hadithId: h.id, title: g.sourceTitle || `معنى ${g.keys.join('، ')} — شرح ابن دقيق العيد`, url: g.source, kind: 'meaning', excerpt: g.text }));
            return { id: h.id, title: h.title, text: h.text, textReference: 'H' + h.id, commentary: c && EvidenceRepository.isTrustedUrl(c.source) ? { excerpt: c.text, reference: 'C' + h.id } : null, meanings: meanings.map((g, i) => ({ keys: g.keys, text: g.text, reference: `G${h.id}-${i}` })) };
        });
        const passages = findSourcePassages(question, commentaryPages, { limit: 8 });
        for (const { score, ...p } of passages)
            references.set(p.id, p);
        const meaningMatches = findMeaningMatches(question, this.data, null, EvidenceRepository.isTrustedUrl);
        return { corpus, references, passages, meaningMatches };
    }
    select(plan) {
        const data = this.data;
        const base = this.build();
        const selected = new Set(plan.hadithIds), references = new Map([...base.references].filter(([, r]) => selected.has(r.hadithId)));
        const passages = (data.commentaryPages || []).filter(p => selected.has(p.id) && EvidenceRepository.isTrustedUrl(p.source)).map(p => ({
            id: 'S' + p.sourcePage, hadithId: p.id, title: `شرح ابن دقيق العيد — الحديث ${p.id} — ص ${p.page}`,
            url: p.source, kind: 'commentary', excerpt: p.text
        }));
        for (const p of passages)
            references.set(p.id, p);
        const meanings = findMeaningMatches('معنى ' + (plan.terms?.[0] || ''), data, plan.hadithIds[0], EvidenceRepository.isTrustedUrl)
            .filter(item => selected.has(item.hadithId));
        for (const { score, term, english, word, ...reference } of meanings) references.set(reference.id, reference);
        return { collection: base.corpus.filter(h => selected.has(h.id)), passages, references };
    }
}
