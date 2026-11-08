import { parseMeaningQuestion, findSourcePassages } from '../utils/source-search.mjs';
// Evidence search remains available offline; AI is requested only by an explicit submit.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const copy = { ar: { open: 'اسأل عن الأحاديث', title: 'المساعد الذكي في الأحاديث', intro: 'ابحث في معاني الأحاديث الـ٤٢ وسياقها، مع الاستعانة بـ١١٦ صفحة من شرح ابن دقيق العيد وإظهار المراجع. تُرسل أسئلتك والمقاطع المرجعية اللازمة إلى خدمة ذكاء اصطناعي خارجية لإعداد الإجابة؛ المساعد للتعلّم وليس للإفتاء.', label: 'كلمة، موضوع، أو سؤال', placeholder: 'مثل: معنى الدثور، أو الأحاديث المتعلقة بالنية', ask: 'اسأل المساعد', local: 'البحث النصي والمصادر', busy: 'يفهم المساعد سؤالك ويبحث في سياق الأحاديث وشروحها…', offline: 'أنت دون اتصال. البحث المحلي والمقتطفات الموثقة متاحة؛ يحتاج المساعد إلى الإنترنت.', error: 'تعذّر الاتصال بالمساعد. يمكنك استخدام البحث المحلي أدناه.', results: 'نتائج البحث المحلي في الأحاديث الـ٤٢', none: 'لم نجد تطابقًا نصيًا. جرّب كلمة من المتن أو الشرح، أو اسأل المساعد للبحث بالمعنى.', empty: 'اكتب كلمة أو موضوعًا للبحث في المجموعة كاملة.', close: 'إغلاق', sources: 'المراجع المستخدمة', passage: 'عرض النص الذي استندت إليه الإجابة', summary: 'تفسير المساعد في سياق الحديث', read: 'افتح الحديث', commentary: 'مقتطف من شرح ابن دقيق العيد', text: 'متن الحديث وتخريجه', related: 'أبرز الأحاديث ذات الصلة', quota: 'بلغت خدمة الإجابات حد الاستخدام. حاول لاحقًا؛ البحث المحلي والشروح الموثقة متاحة.', question: 'اكتب سؤالًا بين حرفين و٨٠٠ حرف.' }, en: { open: 'Ask about the hadith', title: 'Hadith study assistant', intro: 'Explore the meanings and context of all 42 hadith using 116 pages from Ibn Daqiq al-Eid’s commentary, with references shown alongside the answer. Your questions and the necessary reference passages are sent to an external AI service to prepare the answer. The assistant supports study and does not issue personal rulings.', label: 'A word, topic, or question', placeholder: 'For example: What does al-duthur mean?', ask: 'Ask the assistant', local: 'Search texts and commentary', busy: 'Interpreting your question and searching the hadith context and commentary…', offline: 'You are offline. Local texts and sourced commentary remain available. The assistant needs an internet connection.', error: 'The assistant is unavailable. You can use local search below.', results: 'Local results across all 42 hadith', none: 'No text match. Try a word from the Arabic text or commentary, or ask the assistant for a meaning-based search.', empty: 'Enter an Arabic word, topic, or hadith number to search the complete collection.', close: 'Close', sources: 'References used', passage: 'View the source passage', summary: 'AI explanation in the hadith context', read: 'Open hadith', commentary: 'Excerpt from Ibn Daqiq al-Eid’s commentary', text: 'Hadith text and references', related: 'Hadith mentioned', quota: 'The answer service has reached its usage limit. Try later; local search and sourced commentary remain available.', question: 'Enter a question between 2 and 800 characters.' } };
export function answerHTML(answer, references) {
    const refs = new Map(references.map(r => [r.id, r]));
    return String(answer).split(/(\[(?:(?:H|C|S)\d+|(?:G|P|W)\d+-\d+)\])/g).map(part => {
        const ref = refs.get(part.slice(1, -1));
        if (!ref)
            return escapeHTML(part);
        try {
            const internalMeaning = ref.kind === 'learning_meaning' && /^\/#read\/(?:[1-9]|[1-3]\d|4[0-2])\/[1-9]\d{0,3}$/u.test(ref.url);
            if (!internalMeaning && new URL(ref.url).protocol !== 'https:')
                return escapeHTML(part);
        }
        catch {
            return escapeHTML(part);
        }
        return `<a href="${escapeHTML(ref.url)}" target="_blank" rel="noopener noreferrer" class="research-citation" title="${escapeHTML(ref.title)}">${escapeHTML(part)}</a>`;
    }).join('');
}
export function assistantInfoHTML(language = 'ar', origin = 'ai') {
    if (origin === 'source_excerpt') return `<p class="research-assistant-note small-note">${language === 'en' ? 'A saved meaning from the study content, with its reference.' : 'معنى من المحتوى المحفوظ مع مرجعه.'}</p>`;
    const text = language === 'en'
        ? 'An AI-generated explanation. Review the supporting references below.'
        : 'شرح مولّد بالذكاء الاصطناعي. يمكنك مراجعة المراجع المرفقة أدناه.';
    return `<p class="research-assistant-note small-note">${escapeHTML(text)}</p>`;
}
export class ResearchController {
    constructor(reader, fetcher = (...args) => globalThis.fetch(...args)) {
        this.reader = reader;
        this.fetcher = fetcher;
        this.request = null;
        this.pages = [];
        this.pagesPromise = Promise.resolve().then(() => this.fetcher('commentary-pages.json')).then(r => r.ok ? r.json() : []).then(p => {
            this.pages = p;
            if (this.dialog?.open)
                this.localSearch();
        }).catch(() => { this.pages = []; });
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'research-dialog';
        this.dialog.id = 'research-dialog';
        document.body.append(this.dialog);
        this.onClick = e => {
            if (e.target.closest('[data-action="research"]'))
                this.open();
        };
        document.addEventListener('click', this.onClick);
        this.dialog.addEventListener('close', () => this.request?.abort());
    }
    get language() { return document.documentElement.lang === 'en' ? 'en' : 'ar'; }
    get labels() { return copy[this.language]; }
    open() {
        this.request?.abort();
        const t = this.labels;
        this.contextHadithId = this.reader.reading ? this.reader.current()?.id || null : null;
        const context = this.contextHadithId ? this.reader.getHadith(this.contextHadithId) : null;
        this.dialog.lang = this.language;
        this.dialog.dir = this.language === 'en' ? 'ltr' : 'rtl';
        this.dialog.innerHTML = `<div class="research-header"><h2 id="research-title">${t.title}</h2><button type="button" class="icon" data-research-close aria-label="${t.close}">×</button></div><p class="research-intro">${t.intro}</p><form id="research-form"><label for="research-question">${t.label}</label><textarea id="research-question" rows="2" minlength="2" maxlength="800" placeholder="${t.placeholder}" required></textarea>${context ? `<label class="research-context"><input type="checkbox" id="research-context" checked> ${this.language === 'en' ? 'Use the open hadith as context' : 'الاستعانة بسياق الحديث المفتوح'}: ${context.id} · ${escapeHTML(context.title)}</label>` : ``}<div class="research-actions"><button class="primary" type="submit" id="research-submit">${t.ask}</button><button type="button" id="research-local">${t.local}</button></div></form><p id="research-status" role="status" aria-live="polite"></p><section id="research-answer" hidden aria-labelledby="research-answer-title"></section><details id="research-local-panel"><summary>${t.local}</summary><section class="research-local-results" aria-labelledby="research-results-title"><h3 id="research-results-title">${t.results}</h3><div id="research-matches"><p>${t.empty}</p></div></section></details>`;
        this.dialog.setAttribute('aria-labelledby', 'research-title');
        this.dialog.querySelector('[data-research-close]').onclick = () => this.dialog.close();
        this.dialog.onkeydown = e => {
            if (e.key === 'Escape')
                e.stopPropagation();
        };
        this.dialog.querySelector('#research-local').onclick = () => { this.dialog.querySelector('#research-local-panel').open = true; this.localSearch(); };
        this.dialog.querySelector('#research-question').oninput = () => {
            this.request?.abort();
            this.dialog.querySelector('#research-submit').disabled = false;
            this.dialog.querySelector('#research-answer').hidden = true;
            this.dialog.querySelector('#research-status').textContent = '';
            this.localSearch();
        };
        this.dialog.querySelector('#research-form').onsubmit = e => { e.preventDefault(); this.ask(); };
        if (navigator.onLine === false)
            this.dialog.querySelector('#research-status').textContent = t.offline;
        if (!this.dialog.open)
            this.dialog.showModal();
        this.dialog.querySelector('#research-question').focus();
    }
    localSearch() {
        const q = this.dialog.querySelector('#research-question').value.trim(), t = this.labels, container = this.dialog.querySelector('#research-matches');
        if (!q) {
            container.innerHTML = `<p>${t.empty}</p>`;
            return;
        }
        const lookup = parseMeaningQuestion(q)?.term || q;
        const results = this.reader.hadithService.search(lookup, this.reader.hadiths);
        container.innerHTML = results.length ? results.map(({ hadith: h, matches, evidence }) => {
            const c = this.reader.content.commentary.find(c => c.id === h.id), snippet = evidence?.text || h.text;
            return `<article class="research-match"><button type="button" data-research-open="${h.id}"><strong>${h.id} · ${escapeHTML(h.title)}</strong><span>${t.read} ←</span></button><p dir="rtl">${escapeHTML(snippet.slice(0, 550))}${snippet.length > 550 ? '…' : ''}</p><a href="${escapeHTML(evidence?.source || h.source)}" target="_blank" rel="noopener noreferrer">${evidence ? t.commentary : t.text} ↗</a>${!evidence && c ? `<details><summary>${t.commentary}</summary><p dir="rtl">${escapeHTML(c.text)}</p><a href="${escapeHTML(c.source)}" target="_blank" rel="noopener noreferrer">${t.sources} ↗</a></details>` : ''}</article>`;
        }).join('') : `<p>${t.none}</p>`;
        const passages = findSourcePassages(q, this.pages);
        if (passages.length)
            container.innerHTML = `<h4>${this.language === 'en' ? 'Original commentary passages' : 'من الشرح الأصلي — نص موثّق'}</h4>` + passages.map(p => `<article class="research-match"><button type="button" data-research-open="${p.hadithId}">${escapeHTML(p.title)}</button><p dir="rtl">${escapeHTML(p.excerpt)}</p><a href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(p.title)} ↗</a></article>`).join('') + container.innerHTML;
        this.bindOpen(container);
    }
    bindOpen(container) {
        for (const button of container.querySelectorAll('[data-research-open]'))
            button.onclick = () => { this.request?.abort(); this.dialog.close(); this.reader.routeTo(Number(button.dataset.researchOpen)); };
    }
    async ask() {
        this.request?.abort();
        const question = this.dialog.querySelector('#research-question').value.trim(), t = this.labels, status = this.dialog.querySelector('#research-status'), submit = this.dialog.querySelector('#research-submit'), answer = this.dialog.querySelector('#research-answer');
        answer.hidden = true;
        this.localSearch();
        if (question.length < 2 || question.length > 800) {
            status.textContent = t.question;
            return;
        }
        if (navigator.onLine === false) {
            status.textContent = t.offline;
            return;
        }
        const controller = new AbortController();
        this.request = controller;
        submit.disabled = true;
        status.textContent = t.busy;
        try {
            const response = await this.fetcher('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, language: this.language, contextHadithId: this.dialog.querySelector('#research-context')?.checked ? this.contextHadithId : null }), signal: controller.signal });
            const data = await response.json();
            if (controller.signal.aborted || this.request !== controller)
                return;
            if (!response.ok) {
                status.textContent = ['rate_limited', 'quota_exhausted'].includes(data.error) ? t.quota : (data.message || t.error);
                return;
            }
            const refs = Array.isArray(data.references) ? data.references : [], ids = [...new Set([...(data.hadithIds || []), ...(data.searchHadithIds || [])])].filter(id => this.reader.getHadith(id));
            answer.innerHTML = `<h3 id="research-answer-title">${data.answerOrigin === 'source_excerpt' ? (this.language === 'en' ? 'Meaning from saved content' : 'معنى من المحتوى المحفوظ') : t.summary}</h3>${refs.length ? assistantInfoHTML(this.language, data.answerOrigin) : ''}<div class="research-answer-text" dir="${this.language === 'en' ? 'ltr' : 'rtl'}">${answerHTML(data.answer, refs)}</div>${ids.length ? `<div class="research-related" aria-label="${t.related}">${ids.map(id => `<button type="button" data-research-open="${id}">${id} · ${escapeHTML(this.reader.getHadith(id).title)}</button>`).join('')}</div>` : ''}${refs.length ? `<h4>${t.sources}</h4><ol class="research-references">${refs.map(ref => `<li>${answerHTML('[' + ref.id + ']', refs)} ${escapeHTML(ref.title)}${ref.excerpt ? `<details><summary>${t.passage}</summary><p dir="rtl">${escapeHTML(ref.excerpt)}</p></details>` : ''}</li>`).join('')}</ol>` : ''}`;
            answer.hidden = false;
            status.textContent = '';
            this.bindOpen(answer);
        }
        catch (e) {
            if (e.name !== 'AbortError' && !controller.signal.aborted)
                status.textContent = t.error;
        }
        finally {
            if (this.request === controller) {
                submit.disabled = false;
                this.request = null;
            }
        }
    }
    destroy() { this.request?.abort(); document.removeEventListener('click', this.onClick); this.dialog.remove(); }
}
