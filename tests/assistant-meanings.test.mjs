import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ResearchService } from '../server/research-service.mjs';
import { EvidenceRepository } from '../server/evidence-repository.mjs';
import { AIClient } from '../server/ai-client.mjs';
import { AnswerValidator } from '../server/answer-validator.mjs';
import { findMeaningMatches } from '../server/meaning-search.mjs';
import { answerHTML, assistantInfoHTML } from '../public/js/controllers/research-controller.mjs';
const read = name => JSON.parse(fs.readFileSync(new URL('../public/' + name + '.json', import.meta.url)));
const data = { hadiths: read('hadiths'), commentary: read('commentary'), glossary: read('glossary'), commentaryPages: read('commentary-pages'), wordMeanings: read('word-meanings') };
const req = (question, contextHadithId = 11) => new Request('https://reader.test/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, contextHadithId }) });
const response = (text, id, fenced = false) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: (fenced ? '```json\n' : '') + JSON.stringify({ answered: true, paragraphs: [{ text, kind: 'explanation', sourceIds: [id] }] }) + (fenced ? '\n```' : '') }] } }] });
const service = (fetcher, env = { AI_API_KEY: 'test-only' }) => new ResearchService(new EvidenceRepository(data), new AIClient(env, fetcher));

test('Rayhanah variants and Sibt use a single generation with their actual named sources', async () => {
    for (const [question, id, text, host] of [
        ['ما معنى ريحانته؟', 'G11-2', 'وصف يدل على محبته للحسن وقربه منه، تشبيهًا بالريحان الطيب.', 'hadeethenc.com'],
        ['مامعنى ريحانه؟', 'G11-2', 'الريحان نبات طيب الرائحة، والوصف هنا للمحبة والقرب.', 'hadeethenc.com'],
        ['ريحانة', 'G11-2', 'الريحان نبات طيب الرائحة، والوصف هنا للمحبة والقرب.', 'hadeethenc.com'],
        ['وش معنى سبط؟', 'G11-1', 'السبط ابن البنت؛ والمقصود الحسن ابن فاطمة.', 'binbaz.org.sa'],
        ['سبط', 'G11-1', 'السبط ابن البنت؛ والمقصود الحسن ابن فاطمة.', 'binbaz.org.sa']
    ]) {
        let calls = 0;
        const result = await service(async (url, options) => {
            calls++;
            const body = JSON.parse(options.body), payload = JSON.parse(body.contents[0].parts[0].text);
            assert.equal(payload.answerType, 'meaning');
            assert.ok(payload.collection.some(h => h.id === 11));
            assert.ok(body.generationConfig.responseFormat.text.schema.properties.paragraphs.items.properties.sourceIds.items.enum.includes(id));
            return Response.json(response(text, id, true));
        }).handle(req(question, 2));
        const answer = await result.json();
        assert.equal(result.status, 200); assert.equal(calls, 1); assert.equal(answer.answerOrigin, 'ai');
        assert.match(answer.answer, /الحسن|الريحان/);
        assert.equal(new URL(answer.references[0].url).hostname, host);
        assert.doesNotMatch(answer.references[0].title, /ابن دقيق/);
    }
});

test('educational word meanings are available to AI with their own attribution', async () => {
    let calls = 0;
    const result = await service(async (url, options) => {
        calls++;
        const payload = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
        const ref = payload.wordMeanings.find(r => r.id === 'W11-22');
        assert.equal(ref.kind, 'learning_meaning'); assert.match(ref.title, /تعليمي/);
        return Response.json(response('حفظت: استوعبت الكلام وأثبتّه في الذاكرة.', ref.id));
    }).handle(req('ما معنى حفظت في الحديث 11؟'));
    const answer = await result.json(); assert.equal(calls, 1); assert.equal(answer.answerOrigin, 'ai');
    assert.equal(answer.references[0].url, '/#read/11/23');
    assert.match(answerHTML(answer.answer, answer.references), /href="\/#read\/11\/23"/);
});

test('quota, invalid model output and missing key still show an existing meaning without claiming new AI generation', async () => {
    for (const mode of ['quota', 'invalid', 'missing']) {
        let calls = 0;
        const result = await service(async () => {
            calls++;
            return mode === 'quota' ? Response.json({}, { status: 429 }) : Response.json(response('Unknown source', 'C999'));
        }, mode === 'missing' ? {} : { AI_API_KEY: 'test-only' }).handle(req('ما معنى ريحانته؟'));
        const answer = await result.json();
        assert.equal(result.status, 200); assert.equal(calls, mode === 'missing' ? 0 : 1);
        assert.equal(answer.answerOrigin, 'source_excerpt'); assert.equal(answer.references[0].id, 'G11-2');
        assert.doesNotMatch(answer.answer, /Unknown source|C999/);
        assert.doesNotMatch(assistantInfoHTML('ar', answer.answerOrigin), /مولّد|بالذكاء/);
    }
});

test('word retrieval validates the token position and does not promote an untrusted external note', () => {
    const altered = structuredClone(data);
    altered.wordMeanings.entries.find(e => e.id === 11).words[22].word = 'different';
    altered.glossary.push({ id: 11, keys: ['حفظت'], text: 'Untrusted', source: 'https://shamela.ws.evil.test' });
    assert.deepEqual(findMeaningMatches('معنى حفظت في الحديث 11', altered, 11, EvidenceRepository.isTrustedUrl), []);
    assert.equal(findMeaningMatches('معنى سبط في الحديث 2', data, 11, EvidenceRepository.isTrustedUrl).length, 0);
});

test('complete fenced JSON is accepted while invented citations remain rejected', () => {
    const refs = new EvidenceRepository(data).select({ hadithIds: [11], terms: ['سبط'] }).references;
    assert.equal(new AnswerValidator().extract(response('السبط ابن البنت.', 'G11-1', true), refs, 'ar', 'meaning').references[0].id, 'G11-1');
    assert.deepEqual(new AnswerValidator().extract(response('معنى مزعوم.', 'C999', true), refs, 'ar', 'meaning').references, []);
});
