// Domain: immutable source text, stable word positions, search and book pagination.
export const normalize = s => String(s).normalize('NFKD').replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ـ/g, '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0)).toLowerCase().trim();
export const lexeme = s => normalize(s).replace(/[^\p{L}\p{N}]/gu, '');
export const words = h => h.words || h.text.trim().split(/\s+/u);
export const TOPICS = [{ id: 'faith', name: 'الإيمان والعبادات', ids: [1, 2, 3, 4, 5, 8, 9, 10, 19, 21, 22, 23, 24, 29, 30, 37, 38, 41, 42] }, { id: 'manners', name: 'الآداب وتزكية النفس', ids: [7, 11, 12, 13, 15, 16, 17, 18, 20, 27, 28, 31, 40] }, { id: 'society', name: 'الحقوق والمعاملات', ids: [6, 14, 25, 26, 32, 33, 34, 35, 36, 39] }];
export function makePages(hadiths, size = 92) {
    let pages = [];
    for (const h of hadiths) {
        const ws = words(h);
        for (let start = 0; start < ws.length; start += size)
            pages.push({ number: pages.length + 1, id: h.id, start, end: Math.min(start + size, ws.length), part: Math.floor(start / size) + 1, parts: Math.ceil(ws.length / size) });
    }
    return pages;
}
export function pageFor(pages, id, word = 0) { return pages.find(p => p.id === Number(id) && word >= p.start && word < p.end)?.number || pages.find(p => p.id === Number(id))?.number || 1; }
export function search(hadiths, query, { exact = false } = {}) {
    const q = normalize(query);
    if (!q)
        return [];
    const tokens = q.split(/\s+/), numeric = /^\d+$/.test(q);
    return hadiths.filter(h => numeric ? h.id === Number(q) : tokens.every(t => normalize(h.title + ' ' + h.text).includes(t))).map(h => ({ hadith: h, matches: numeric ? [] : words(h).flatMap((w, i) => (exact ? lexeme(w) === lexeme(q) : tokens.some(t => normalize(w).includes(t))) ? [i] : []) }));
}
export function takhrijText(h) {
    const ws = words(h);
    let at = ws.findIndex(w => /^(?:و?رواه|رواهما|رويناه)$/.test(lexeme(w)));
    if (at < 0)
        return '';
    while (at > 0 && /^(?:حديث|حسن|صحيح)$/.test(lexeme(ws[at - 1])))
        at--;
    return ws.slice(at).join(' ');
}
export function occurrences(hadiths, word) {
    const key = lexeme(word);
    if (!key)
        return [];
    return hadiths.flatMap(h => words(h).flatMap((w, i) => lexeme(w) === key ? [{ id: h.id, index: i, word: w, context: words(h).slice(Math.max(0, i - 3), i + 4).join(' ') }] : []));
}
export function validateBackup(data) {
    if (!data || data.format !== 'arbaeen-reader' || data.version !== 1 || !Array.isArray(data.bookmarks) || !Array.isArray(data.progress) || !data.notes || Array.isArray(data.notes) || typeof data.notes !== 'object')
        throw Error('ملف النسخة غير صالح');
    if (data.bookmarks.length > 10000 || data.progress.length > 42)
        throw Error('حجم الملف غير صالح');
    for (const b of data.bookmarks)
        if (!Number.isInteger(b.id) || b.id < 1 || b.id > 42 || !(b.word === null || Number.isInteger(b.word) && b.word >= 0 && b.word < 2000))
            throw Error('موضع إشارة غير صالح');
    for (const p of data.progress)
        if (!Number.isInteger(p.id) || p.id < 1 || p.id > 42 || !['read', 'memorized'].includes(p.state))
            throw Error('سجل تقدم غير صالح');
    for (const [k, v] of Object.entries(data.notes))
        if (!/^([1-9]|[1-3][0-9]|4[0-2])$/.test(k) || typeof v !== 'string' || v.length > 10000)
            throw Error('ملاحظة غير صالحة');
    const bookmarks = new Set(), progress = new Set();
    for (const b of data.bookmarks) {
        const key = b.id + ':' + b.word;
        if (bookmarks.has(key))
            throw Error('إشارة مكررة في النسخة');
        bookmarks.add(key);
    }
    for (const p of data.progress) {
        if (progress.has(p.id))
            throw Error('سجل تقدم مكرر في النسخة');
        progress.add(p.id);
    }
    return data;
}
