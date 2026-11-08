import { lexeme, words } from '../public/js/utils/domain.mjs';
import { parseMeaningQuestion } from '../public/js/utils/source-search.mjs';

// Match a requested word across the complete collection, preferring its open context.
function forms(value) {
    const raw = lexeme(value).replace(/ة$/u, 'ه'), values = new Set([raw]);
    for (const word of [...values]) {
        if (/^[وف]/u.test(word) && word.length > 3) values.add(word.slice(1));
    }
    for (const word of [...values]) {
        if (word.startsWith('ال') && word.length > 4) values.add(word.slice(2));
        if (word.endsWith('ته') && word.length > 4) values.add(word.slice(0, -2) + 'ه');
        if (word.endsWith('ه') && word.length > 3) values.add(word.slice(0, -1));
        if (word.endsWith('ة')) values.add(word.slice(0, -1) + 'ه');
    }
    return values;
}

export function findMeaningMatches(question, data, contextHadithId = null, trusted = () => false) {
    const parsed = parseMeaningQuestion(question);
    const bare = String(question).trim().replace(/[؟?!.,،«»"']/gu, '');
    const term = parsed?.term || (/^[\p{L}\p{M}]+$/u.test(bare) ? bare : null);
    if (!term) return [];
    const requested = forms(term), matches = [], seen = new Set();
    const same = value => [...forms(value)].some(form => requested.has(form));
    const add = entry => {
        if (parsed?.hadithId && entry.hadithId !== parsed.hadithId) return;
        const key = entry.hadithId + ':' + entry.kind + ':' + entry.excerpt;
        if (seen.has(key)) return;
        seen.add(key);
        matches.push({ ...entry, term, score: (entry.hadithId === contextHadithId ? 100 : 0) + (entry.kind === 'meaning' ? 20 : 0) });
    };
    for (const hadith of data.hadiths) {
        const notes = (data.glossary || []).filter(row => row.id === hadith.id);
        notes.forEach((note, index) => {
            if (trusted(note.source) && note.keys.some(same)) add({
                id: `G${hadith.id}-${index}`, hadithId: hadith.id, word: note.keys[0],
                excerpt: note.text, english: note.en, kind: 'meaning', url: note.source,
                title: note.sourceTitle || `معنى ${note.keys.join('، ')} — شرح ابن دقيق العيد`
            });
        });
        const entry = data.wordMeanings?.entries?.find(row => row.id === hadith.id);
        const tokens = words(hadith);
        entry?.words?.forEach((item, index) => {
            if (item.word !== tokens[index] || !same(item.word) || !item.ar) return;
            add({ id: `W${hadith.id}-${index}`, hadithId: hadith.id, word: item.word,
                excerpt: item.ar, english: item.en, kind: 'learning_meaning',
                url: `/#read/${hadith.id}/${index + 1}`, title: `معنى تعليمي في البرنامج — ${item.word} — الحديث ${hadith.id}` });
        });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, 12);
}

export function sourceMeaningAnswer(matches, language) {
    const match = matches.find(item => language !== 'en' || item.english);
    if (!match) return null;
    const { score, term, english, word, ...reference } = match;
    return { answer: (language === 'en' ? english : match.excerpt) + ` [${match.id}]`,
        references: [reference], hadithIds: [match.hadithId], answerOrigin: 'source_excerpt' };
}
