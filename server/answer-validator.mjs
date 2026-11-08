const planSchema = { type: 'object', properties: {
        hadithIds: { type: 'array', maxItems: 6, items: { type: 'integer', minimum: 1, maximum: 42 } },
        answerType: { type: 'string', enum: ['meaning', 'context', 'text'] },
        terms: { type: 'array', maxItems: 8, items: { type: 'string' } }, needsClarification: { type: 'boolean' }
    }, required: ['hadithIds', 'answerType', 'terms', 'needsClarification'] };
function responseJSON(response) {
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') return null;
    const text = (candidate.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    return JSON.parse(text.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, ''));
}
// Validates provider JSON and constructs citations from server-owned evidence.
export class AnswerValidator {
    unavailable(language) {
        return {
            answer: language === 'en'
                ? 'The indexed sources do not provide enough evidence to answer. Try a specific phrase or hadith number, or consult the original commentary.'
                : 'لم أتمكن من تحديد جواب لهذه الصياغة. اكتب الكلمة نفسها أو أضف رقم الحديث؛ ويمكنك فتح معناها مباشرة من صفحة القراءة.',
            references: [], hadithIds: []
        };
    }
    planningSchema() { return planSchema; }
    parsePlan(response) {
        try {
            const plan = responseJSON(response);
            if (!plan) return null;
            if (!Array.isArray(plan.hadithIds) || plan.hadithIds.length > 6 || plan.hadithIds.some(id => !Number.isInteger(id) || id < 1 || id > 42))
                return null;
            if (!['meaning', 'context', 'text'].includes(plan.answerType))
                return null;
            if (!Array.isArray(plan.terms) || plan.terms.length > 8 || plan.terms.some(t => typeof t !== 'string' || t.length > 80))
                return null;
            if (typeof plan.needsClarification !== 'boolean')
                return null;
            return { ...plan, hadithIds: [...new Set(plan.hadithIds)] };
        }
        catch {
            return null;
        }
    }
    schema(references, language = 'ar', answerType = 'context') {
        return {
            type: 'object', properties: { answered: { type: 'boolean' }, paragraphs: { type: 'array', maxItems: answerType === 'meaning' ? 2 : answerType === 'context' ? 3 : 4, items: {
                        type: 'object', properties: { text: { type: 'string', description: language === 'en' ? 'A concise paragraph written in English, explaining the Arabic source evidence. Do not copy an Arabic-only paragraph.' : 'فقرة عربية موجزة مستندة إلى الأدلة.' }, kind: { type: 'string', enum: answerType === 'text' ? ['text', 'explanation'] : ['explanation'] },
                            sourceIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: [...references.keys()] } } },
                        required: ['text', 'kind', 'sourceIds']
                    } } }, required: ['answered', 'paragraphs']
        };
    }
    extract(response, references, language = 'ar', answerType = null) {
        const fallback = () => this.unavailable(language), candidate = response.candidates?.[0];
        if (!candidate || candidate.finishReason !== 'STOP')
            return fallback();
        let result;
        try {
            result = responseJSON(response);
        }
        catch {
            return fallback();
        }
        if (result?.answered !== true || !Array.isArray(result.paragraphs) || !result.paragraphs.length || result.paragraphs.length > 8)
            return fallback();
        if (answerType === 'meaning' && result.paragraphs.length > 2)
            return fallback();
        if (answerType === 'context' && result.paragraphs.length > 3)
            return fallback();
        const used = new Map(), paragraphs = [];
        for (const paragraph of result.paragraphs) {
            if (!paragraph || typeof paragraph.text !== 'string' || !['text', 'explanation'].includes(paragraph.kind))
                return fallback();
            if (answerType && answerType !== 'text' && paragraph.kind !== 'explanation')
                return fallback();
            const text = paragraph.text.trim(), ids = paragraph.sourceIds;
            if (!text || text.length > 1800 || !Array.isArray(ids) || !ids.length || ids.length > 6)
                return fallback();
            if (language === 'en' && !/[A-Za-z]{3}\s+[A-Za-z]{3}/.test(text))
                return fallback();
            // Source URLs and citation labels are constructed here, never by the model.
            if (/https?:\/\/|www\.|\[(?:H|C|G|W|P|S)\d/iu.test(text))
                return fallback();
            if (ids.some(id => typeof id !== 'string' || !references.has(id)))
                return fallback();
            const refs = [...new Set(ids)].map(id => references.get(id));
            if (paragraph.kind === 'explanation' && !refs.some(ref => ['commentary', 'meaning', 'learning_meaning'].includes(ref.kind)))
                return fallback();
            refs.forEach(ref => used.set(ref.id, ref));
            paragraphs.push(text + ' ' + refs.map(ref => '[' + ref.id + ']').join(' '));
        }
        return { answer: paragraphs.join('\n\n'), references: [...used.values()], hadithIds: [...new Set([...used.values()].map(ref => ref.hadithId))] };
    }
}
