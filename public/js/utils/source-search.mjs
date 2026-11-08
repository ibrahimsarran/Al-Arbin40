import { normalize } from './domain.mjs';
const clean = value => normalize(value).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const canonical = word => word.replace(/^[وف](?=(?:بال|لل|ال))/u, '').replace(/^(?:بال|كال|لل|ال)(?=.{3})/u, '').replace(/^ب(?=.{3})/u, '');
export function parseMeaningQuestion(question) {
    const q = clean(question).replace(/^(ما|وش|ايش)(معني)/u, '$1 $2 ').replace(/^(معني)(?=\p{L})/u, '$1 ');
    const match = q.match(/^(?:(?:(?:ايش|وش|ما|ماذا)\s+(?:هو\s+)?(?:معني|يعني|تعني))|معني|اشرح(?:\s+معني)?|فسر)(?:\s+كلم[هة])?\s+(.+)$/u);
    if (!match)
        return null;
    let term = match[1], hadithId = null;
    const context = term.match(/\s+(?:في|من)\s+الحديث(?:\s+رقم)?\s+(\d+)$/u);
    if (context) {
        hadithId = Number(context[1]);
        term = term.slice(0, context.index).trim();
    }
    return term && term.length <= 100 ? { term, hadithId } : null;
}
export function findSourcePassages(question, pages, { limit = 5 } = {}) {
    const meaning = parseMeaningQuestion(question), q = meaning?.term || clean(question);
    const terms = q.split(' ').filter(t => t.length > 1 && !['هو', 'هي', 'في', 'من', 'عن', 'الحديث', 'رقم', 'ما', 'معني', 'وش', 'ايش', 'اشرح'].includes(t)).map(canonical);
    if (!terms.length)
        return [];
    const hits = [];
    for (const page of pages || []) {
        if (meaning?.hadithId && page.id !== meaning.hadithId)
            continue;
        const paragraphs = page.text.split(/\n+/).filter(Boolean);
        paragraphs.forEach((paragraph, index) => {
            if (paragraph.length < 10 || /^[٠-٩0-9]+\s*[-ـ–]\s*عن/u.test(paragraph))
                return;
            const text = clean(paragraph), tokens = text.split(' ').map(canonical);
            if (!terms.every(term => tokens.includes(term)))
                return;
            const explains = /(?:قوله|معناه|يعني|المراد|بمعني|وهو|وهي|جمع |اي |بضم|بفتح|لفظه)/u.test(text) || (paragraph.includes(':') && terms.every(t => text.slice(0, 80).split(' ').map(canonical).includes(t)));
            if (meaning && !explains)
                return;
            const quoted = [...paragraph.matchAll(/"([^"]+)"/g)].map(m => clean(m[1]).split(' ').map(canonical).join(' '));
            const target = terms.join(' '), exactQuote = quoted.includes(target);
            const score = (exactQuote ? 30 : 0) + (explains ? 5 : 0) + (terms.every(t => text.slice(0, 110).split(' ').map(canonical).includes(t)) ? 12 : 0) - Math.min(paragraph.length / 2000, 2);
            const at = Math.max(0, paragraph.indexOf(q));
            let excerpt = paragraph;
            if (excerpt.length > 2000)
                excerpt = (at > 100 ? '…' : '') + paragraph.slice(Math.max(0, at - 100), Math.max(0, at - 100) + 1800) + '…';
            hits.push({ id: `P${page.sourcePage}-${index}`, hadithId: page.id, title: `شرح ابن دقيق العيد — الحديث ${page.id} — ص ${page.page}`, url: page.source, kind: 'commentary', excerpt, score });
        });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
