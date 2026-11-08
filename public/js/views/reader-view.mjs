import { normalize, lexeme, words, TOPICS } from '../utils/domain.mjs';
import { $, $$, esc, ar, link, glyph } from '../utils/ui-utils.mjs';
// Renders reading screens from the controller's current view model.
export class ReaderView {
    constructor(reader) {
        this.reader = reader;
        this.toastTimer = null;
        this.filterNames = {
            context: 'السياق', meaning: 'معنى الكلمة', 'meaning-en': 'المعنى بالإنجليزية', grammar: 'الإعراب', occurrences: 'مواضع الكلمة', text: 'النص', explanation: 'الشرح', source: 'التخريج', note: 'ملاحظاتي', info: 'معلومات الصفحة', about: 'عن الكتاب', progress: 'رحلة الحفظ', sources: 'المصادر'
        };
    }
    setFocus(on) {
        document.body.classList.toggle('fullscreen', on);
        $$('[data-action=focus]').forEach(el => {
            el.setAttribute('aria-pressed', String(on));
            el.setAttribute('aria-label', on ? 'إنهاء وضع التركيز' : 'وضع التركيز');
            el.querySelector('span').textContent = on ? 'عودة' : 'تركيز';
        });
    }
    toast(text) {
        $('#toast').textContent = text;
        $('#toast').classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
    }
    modal(title, html) {
        $('#dialog-title').textContent = title;
        $('#dialog-body').innerHTML = html;
        if (!$('#dialog').open)
            $('#dialog').showModal();
    }
    badge(id) {
        const s = this.reader.study.progress.find(x => x.id === id)?.state;
        return s === 'memorized' ? '<span class="status-badge">محفوظ ✓</span>' : s === 'read' ? '<span class="status-badge read-badge">تمت قراءته</span>' : '';
    }
    tokenHTML(h, start = 0, end = words(h).length) {
        return words(h).slice(start, end).map((w, offset) => {
            const i = start + offset;
            const saved = this.reader.study.isSaved(h.id, i), matches = this.reader.query && normalize(this.reader.query).split(/\s+/).some(q => normalize(w).includes(q));
            return `<button class="hadith-word${saved ? ' saved-word' : ''}${matches ? ' search-match' : ''}${this.reader.audio.highlight?.id === h.id && this.reader.audio.highlight.index === i ? ' word-playing' : ''}" data-word="${i}" data-id="${h.id}" ${this.reader.audio.highlight?.id === h.id && this.reader.audio.highlight.index === i ? 'aria-current="true"' : ''} aria-label="تفاصيل كلمة ${esc(w)}">${esc(w)}</button>`;
        }).join(' ');
    }
    showHome() {
        this.reader.reading = false;
        $$('nav .navlink').forEach(el => el.classList.add('active'));
        document.body.classList.remove('fullscreen', 'is-reading');
        $('#main').innerHTML = `<div class="library-layout"><aside class="collection-intro" aria-label="عن المجموعة"><p class="edition-label">مكتبة الحديث</p><h1><span>الأربعون</span><span>النووية</span></h1><p class="collection-author">للإمام يحيى بن شرف النووي</p><div class="collection-rule"><span>٤٢ حديثًا</span><span>المتن والشرح</span></div><div id="resume"></div><div class="collection-links"><button data-action="audio-library">${glyph('play')}مكتبة الاستماع</button><button data-action="about">${glyph('book')}عن الكتاب ومصادره</button></div></aside><section class="catalog" aria-labelledby="catalog-title"><div class="catalog-title"><h2 id="catalog-title">فهرس الأحاديث</h2><span id="catalog-count" role="status"></span></div><div class="searchbox">${glyph('search')}<input id="search" type="search" autocomplete="off" placeholder="ابحث بعنوان، كلمة، أو رقم حديث" aria-label="البحث في الأحاديث" value="${esc(this.reader.query)}"><kbd>/</kbd><button data-action="clear-search" aria-label="مسح البحث" ${this.reader.query ? '' : 'hidden'}>×</button></div><div class="research-entry"><button data-action="research" class="primary">اسأل عن الأحاديث</button><span>بحث في الأحاديث الـ٤٢ ومعانيها مع المراجع</span></div><div class="catalog-head"><div class="tabs" role="tablist" aria-label="الفهرس"><button data-tab="all" role="tab" aria-selected="${this.reader.homeTab === 'all'}" class="${this.reader.homeTab === 'all' ? 'active' : ''}">جميع الأحاديث</button><button data-tab="topics" role="tab" aria-selected="${this.reader.homeTab === 'topics'}" class="${this.reader.homeTab === 'topics' ? 'active' : ''}">حسب الموضوع</button><button data-tab="memorized" role="tab" aria-selected="${this.reader.homeTab === 'memorized'}" class="${this.reader.homeTab === 'memorized' ? 'active' : ''}">المحفوظ</button></div></div><div id="topic-filters"></div><div id="results" class="hadith-grid"></div></section></div>`;
        this.renderCatalog();
    }
    renderCatalog() {
        const resume = $('#resume');
        if (!resume)
            return;
        resume.innerHTML = this.reader.study.last && this.reader.getHadith(this.reader.study.last.id) ? `<div class="resume-card"><p class="resume-label">موضعك الأخير</p><strong>${esc(this.reader.getHadith(this.reader.study.last.id).title)}</strong><span>الحديث ${ar(this.reader.study.last.id)} · الصفحة ${ar(this.reader.study.last.page || this.reader.hadithService.pageFor(this.reader.study.last.id, this.reader.study.last.word || 0))}</span><button class="primary" data-action="resume">متابعة القراءة ${glyph('arrow')}</button></div>` : `<div class="resume-card"><p class="resume-label">الحديث الأول</p><strong>الأعمال بالنيات</strong><span>ابدأ قراءة الكتاب من هنا</span><button class="primary" data-open="1">ابدأ القراءة ${glyph('arrow')}</button></div>`;
        $('#topic-filters').innerHTML = this.reader.homeTab === 'topics' ? `<div class="topic-chips"><button data-topic="all" class="${this.reader.topic === 'all' ? 'active' : ''}">الكل</button>${TOPICS.map(t => `<button data-topic="${t.id}" class="${this.reader.topic === t.id ? 'active' : ''}">${t.name}</button>`).join('')}</div><p class="small-note">تصنيف موضوعي للتصفح؛ قد يجمع الحديث أكثر من موضوع.</p>` : '';
        let pool = this.reader.hadiths;
        if (!this.reader.query && this.reader.homeTab === 'memorized')
            pool = pool.filter(h => this.reader.study.progress.some(x => x.id === h.id && x.state === 'memorized'));
        if (!this.reader.query && this.reader.homeTab === 'topics' && this.reader.topic !== 'all')
            pool = pool.filter(h => TOPICS.find(x => x.id === this.reader.topic)?.ids.includes(h.id));
        const results = this.reader.query ? this.reader.hadithService.search(this.reader.query, pool) : pool.map(h => ({
            hadith: h, matches: []
        }));
        $('#catalog-count').textContent = `${ar(results.length)} حديثًا${this.reader.query ? ' · نتائج البحث في الأحاديث الـ٤٢ وشروحها' : ''}`;
        $('#results').innerHTML = results.length ? results.map(({ hadith: h, matches, evidence }) => {
            if (!this.reader.query)
                return `<button class="hadith-card" data-open="${h.id}"><span class="medallion">${ar(h.id)}</span><span class="card-text"><span class="hadith-name">${esc(h.title)}</span>${this.badge(h.id)}</span><span class="arrow" aria-hidden="true">${glyph('arrow')}</span></button>`;
            const snippet = evidence ? evidence.text.slice(0, 350) : words(h).slice(Math.max(0, (matches[0] || 0) - 6), (matches[0] || 0) + 20).join(' ');
            return `<div class="catalog-search-hit"><button class="search-result" data-open="${h.id}" ${matches.length ? 'data-at="' + matches[0] + '"' : ''}><small>الحديث ${ar(h.id)} · ${esc(h.title)}</small><p>${esc(snippet)}…</p><span class="result-action">افتح الحديث ←</span></button>${evidence ? `<p class="small-note">نتيجة من الشرح · ${link(evidence.source, 'شرح ابن دقيق العيد')}</p>` : ''}</div>`;
        }).join('') : `<div class="empty"><p>${this.reader.homeTab === 'memorized' && !this.reader.query ? 'لم تسجّل حديثًا محفوظًا بعد.' : 'لم نعثر على نتائج.'}</p><button data-action="${this.reader.homeTab === 'memorized' ? 'progress' : 'clear-search'}" class="primary">${this.reader.homeTab === 'memorized' ? 'افتح رحلة الحفظ' : 'مسح البحث'}</button></div>`;
    }
    paper(p) {
        const h = this.reader.getHadith(p.id);
        return `<article class="book-paper ${p.part > 1 ? 'continuation' : ''}" aria-label="صفحة ${ar(p.number)}، الحديث ${ar(h.id)}"><div class="book-heading"><span>الأربعون النووية</span><span>${p.part > 1 ? 'تتمة الحديث' : 'متن الحديث'}</span></div><div class="book-frame"><div class="hadith-opening"><span class="hadith-index">الحديث ${ar(h.id)}</span><h2 class="hadith-banner">${esc(h.title)}</h2>${p.part > 1 ? `<p class="page-subtitle">الجزء ${ar(p.part)} من ${ar(p.parts)}</p>` : ''}</div><div class="book-text">${this.tokenHTML(h, p.start, p.end)}</div></div><div class="book-folio"><span class="folio-number" aria-label="الصفحة ${ar(p.number)}">${ar(p.number)}</span><div><button data-detail="${h.id}" class="page-source-button">الشرح</button><button class="source-shortcut" data-source-id="${h.id}">التخريج والمصدر</button></div></div></article>`;
    }
    explanationHTML(h) {
        const c = this.reader.content.commentary.find(x => x.id === h.id);
        return `<div class="explanation"><h3>من شرح ابن دقيق العيد</h3>${c?.text ? `<blockquote>${esc(c.text)}</blockquote><p class="source-note">مقتطف من الشرح، وليس الشرح كاملًا.</p>` : '<p class="source-note">اقرأ شرح هذا الحديث في المصدر.</p>'}${link(c?.source || 'https://shamela.ws/book/11244', 'قراءة الشرح في مصدره')}</div>`;
    }
    sourceHTML(h) {
        const source = this.reader.hadithService.takhrijText(h);
        return `<div class="source-panel"><h3>التخريج والروايات الملحقة كما وردت في المتن</h3><p class="qtext">${esc(source || 'التخريج مذكور في نهاية نص الحديث أعلاه.')}</p><p>${link(h.source, 'متن الحديث وتخريجه — Sunnah.com')}</p><p class="source-note">نعرض نسبة الحديث وحكمه الواردين في المصدر؛ لا نضيف حكمًا مستقلًا على صحته.</p></div>`;
    }
    renderReader() {
        if (!this.reader.reading)
            return;
        document.body.classList.add('is-reading');
        $$('nav .navlink').forEach(el => el.classList.remove('active'));
        const h = this.reader.current(), step = this.reader.spread() ? 2 : 1;
        const p = this.reader.pages[this.reader.currentPage - 1];
        const visible = this.reader.spread() ? this.reader.pages.slice(this.reader.currentPage - 1, this.reader.currentPage + 1) : [p];
        const previous = Math.max(1, this.reader.currentPage - step), next = Math.min(this.reader.pages.length, this.reader.currentPage + step), atEnd = this.reader.currentPage + visible.length > this.reader.pages.length;
        document.title = `${h.title} — الأربعون`;
        const pageButtons = (bottom = false) => `<div class="${bottom ? 'bottom-pages' : 'pages-navigation'}" aria-label="تقليب الصفحات"><button data-page="${previous}" ${this.reader.currentPage === 1 ? 'disabled' : ''}>→ <span>السابقة</span></button>${bottom ? `<span>${ar(this.reader.currentPage)}${visible.length > 1 ? '–' + ar(visible.at(-1).number) : ''} / ${ar(this.reader.pages.length)}</span>` : `<label class="page-picker">صفحة <select id="page-select" aria-label="الانتقال إلى صفحة">${this.reader.pages.map(x => `<option value="${x.number}" ${x.number === this.reader.currentPage ? 'selected' : ''}>${ar(x.number)}</option>`).join('')}</select><span>من ${ar(this.reader.pages.length)}</span></label>`}<button data-page="${next}" ${atEnd ? 'disabled' : ''}><span>التالية</span> ←</button></div>`;
        $('#main').innerHTML = `<section class="reader"><div class="reader-top"><a href="#" class="back-index">→ الفهرس</a><label class="hadith-picker"><span>الحديث</span><select id="hadith-select" aria-label="الانتقال إلى حديث">${this.reader.hadiths.map(x => `<option value="${x.id}" ${x.id === h.id ? 'selected' : ''}>${ar(x.id)}. ${esc(x.title)}</option>`).join('')}</select></label><div class="segmented" role="tablist" aria-label="وضع القراءة"><button data-view="pages" role="tab" aria-selected="${this.reader.view === 'pages'}" class="${this.reader.view === 'pages' ? 'active' : ''}">المتن</button><button data-view="explanation" role="tab" aria-selected="${this.reader.view === 'explanation'}" class="${this.reader.view === 'explanation' ? 'active' : ''}">الشرح</button></div></div><div class="reader-controls"><div class="reader-selectors"><button class="listen-button" data-action="play-current" aria-label="الاستماع إلى الحديث">${glyph('play')}<span>استمع</span></button>${this.reader.audio.readerSelector()}<button class="download-current" data-action="download-current" aria-label="${this.reader.audio.savedDownload(h.id) ? 'إدارة تنزيل الحديث' : 'تنزيل الحديث للاستماع دون إنترنت'}" ${this.reader.audio.downloadJob || this.reader.audio.downloadStorageError || navigator.onLine === false && !this.reader.audio.savedDownload(h.id) ? 'disabled' : ''}>${glyph('download')}<span>${this.reader.audio.savedDownload(h.id) ? 'منزّل' : 'تنزيل'}</span></button></div><div class="reading-tools"><button class="tool ${this.reader.study.isSaved(h.id) ? 'active' : ''}" data-action="save-current" aria-pressed="${this.reader.study.isSaved(h.id)}" aria-label="${this.reader.study.isSaved(h.id) ? 'إزالة' : 'حفظ'} إشارة الحديث">${glyph('bookmark')}<span>إشارة</span></button><button class="tool" data-action="note-current">${glyph('note')}<span>ملاحظاتي</span></button><button class="tool focus-tool" data-action="focus" aria-pressed="${document.body.classList.contains('fullscreen')}" aria-label="${document.body.classList.contains('fullscreen') ? 'إنهاء وضع التركيز' : 'وضع التركيز'}">${glyph('focus')}<span>${document.body.classList.contains('fullscreen') ? 'عودة' : 'تركيز'}</span></button><button class="tool" data-action="settings" aria-label="إعدادات القراءة">${glyph('settings')}<span>العرض</span></button></div></div><p id="reader-download-state" class="download-inline-state" role="status" ${this.reader.audio.downloadJob ? '' : 'hidden'}>${this.reader.audio.downloadJob ? 'جارٍ تنزيل الصوت…' : ''}</p>${pageButtons()}${this.reader.view === 'pages' ? `<div class="hadith-book ${visible.length === 1 ? 'single-page' : ''}">${visible.map(page => this.paper(page)).join('')}</div>` : `<div class="verse-list"><article class="verse-row"><div class="row-tools"><b>الحديث ${ar(h.id)} · ${esc(h.title)}</b><button data-detail="${h.id}" class="audio-follow">تفاصيل الحديث</button></div><p class="qtext">${this.tokenHTML(h)}</p>${this.explanationHTML(h)}${this.sourceHTML(h)}</article></div>`}${pageButtons(true)}<div class="reading-end"><button class="mark-read" data-action="mark-read">${this.reader.study.progress.some(x => x.id === h.id) ? '✓ مسجّل في رحلتك' : '✓ أتممت القراءة'}</button><button data-action="share-current">مشاركة الحديث ↗</button></div><p class="reader-hint">يمكنك الضغط على الكلمة لعرض معناها وسياقها أو حفظ موضعها.</p></section>`;
    }
    grammarURL(printedPage) {
        return this.reader.content.grammarNotes.reader + 'page/n' + (printedPage + this.reader.content.grammarNotes.pdfPageOffset - 1) + '/mode/1up';
    }
    grammarReferenceHTML(id, page) {
        const p = page || this.reader.content.grammarNotes.chapterPages[id - 1];
        return `<div class="grammar-reference"><span>مرجع الإعراب</span><p>${esc(this.reader.content.grammarNotes.sourceTitle)}</p><p class="source-note">${esc(this.reader.content.grammarNotes.edition)} · <span>الصفحة ${ar(p)}</span></p>${link(this.grammarURL(p), 'فتح الصفحة في كتاب حسني يوسف')}</div>`;
    }
    englishMeaningHTML(h, index) {
        const entry = this.reader.content.wordMeanings.entries.find(x => x.id === h.id), item = entry?.words[index], word = words(h)[index];
        if (!item || item.word !== word)
            return '<div class="detail-empty">لا يتوفر معنى إنجليزي موثّق لهذا الموضع.</div>';
        return `<section class="word-meaning"><span class="meaning-caption">المعنى في سياق الحديث</span><p class="english-meaning" dir="ltr" lang="en" data-source-text>${esc(item.en)}</p><p class="source-note">صياغة تعليمية مختصرة؛ راجع سياق الحديث والمصدر.</p><div class="meaning-references">${link(h.source, 'مصدر الحديث وترجمته')}${link('https://ontology.birzeit.edu/term/' + encodeURIComponent(lexeme(word)), 'معجم عربي إنجليزي')}</div></section>`;
    }
    arabicMeaningHTML(h, index, note) {
        const entry = this.reader.content.wordMeanings.entries.find(x => x.id === h.id), item = entry?.words[index], word = words(h)[index];
        if (!item?.ar || item.word !== word)
            return '<div class="detail-empty">لم يُضف معنى عربي لهذا الموضع بعد.</div>';
        return `<section class="word-meaning"><span class="meaning-caption">المعنى في سياق الحديث</span><p class="arabic-meaning detail-prose" dir="rtl" lang="ar" data-source-text>${esc(item.ar)}</p>${note ? `<div class="lexical-source-note"><span class="meaning-caption">من شرح ابن دقيق العيد</span><p class="detail-prose" dir="rtl" lang="ar" data-source-text>${esc(note.text)}</p>${link(note.source, 'مصدر الشرح اللغوي')}</div>` : ''}<p class="source-note">صياغة تعليمية مختصرة؛ راجع سياق الحديث والمصدر.</p><div class="meaning-references">${link(h.source, 'مصدر الحديث وترجمته')}${link('https://ontology.birzeit.edu/term/' + encodeURIComponent(lexeme(word)), 'معاجم عربية')}</div></section>`;
    }
    renderDetail() {
        if (!this.reader.detail)
            return;
        const { id, word, level } = this.reader.detail, h = this.reader.getHadith(id), w = word !== null ? words(h)[word] : null;
        const filters = level === 'word' ? ['meaning', 'meaning-en', 'context', 'grammar', 'occurrences'] : level === 'hadith' ? ['text', 'explanation', 'source', 'note'] : level === 'page' ? ['text', 'info'] : ['about', 'progress', 'sources'];
        if (!filters.includes(this.reader.detail.filter))
            this.reader.detail.filter = filters[0];
        const f = this.reader.detail.filter;
        $('#detail-levels').innerHTML = [['book', 'الكتاب'], ['page', 'الصفحة'], ['hadith', 'الحديث'], ['word', 'الكلمة']].map(([k, n]) => `<button data-level="${k}" role="tab" aria-selected="${k === level}" class="${k === level ? 'active' : ''}" ${k === 'word' && word === null ? 'disabled' : ''}>${n}</button>`).join('');
        $('#detail-filters').innerHTML = filters.map(k => `<button data-filter="${k}" role="tab" aria-selected="${k === f}" class="${k === f ? 'active' : ''}">${this.filterNames[k]}</button>`).join('');
        $('#detail-breadcrumb').textContent = `الأربعون النووية · الحديث ${ar(id)}${word !== null ? ' · الكلمة ' + ar(word + 1) : ''}`;
        $('#detail-heading').textContent = level === 'word' ? w : level === 'book' ? 'الأربعون النووية' : level === 'page' ? 'الصفحة ' + ar(this.reader.hadithService.pageFor(id, word || 0)) : h.title;
        $('#detail-heading').classList.toggle('hadith-heading', level !== 'word');
        let html = '', sourceURL = h.source, sourceName = 'متن الأربعين النووية — Sunnah.com';
        if (level === 'word') {
            const g = this.reader.content.glossary.find(x => x.id === id && x.keys.includes(lexeme(w)));
            const hosni = this.reader.content.grammarNotes.notes.find(x => x.id === id && x.word === word && x.token === w), grammar = hosni ? {
                ...hosni, source: this.grammarURL(hosni.page), sourceTitle: this.reader.content.grammarNotes.sourceTitle
            }
                : h.analysis?.[String(word)]?.grammar;
            if (f === 'meaning-en')
                html = this.englishMeaningHTML(h, word);
            if (f === 'context')
                html = `<p class="detail-prose context-highlight">${words(h).slice(Math.max(0, word - 6), word + 7).map((s, j) => word === Math.max(0, word - 6) + j ? '<mark>' + esc(s) + '</mark>' : esc(s)).join(' ')}</p><div class="verse-context"><p>الكلمة ${ar(word + 1)} من ${ar(words(h).length)} في الحديث ${ar(id)}.</p><button class="primary" data-set-filter="explanation">اقرأ شرح الحديث</button></div>`;
            if (f === 'meaning') {
                html = this.arabicMeaningHTML(h, word, g);
                if (g) {
                    sourceURL = g.source;
                    sourceName = g.sourceTitle || 'صياغة مختصرة من شرح ابن دقيق العيد';
                }
            }
            if (f === 'grammar') {
                html = grammar ? `<p class="detail-prose">${esc(grammar.text || [grammar.role, grammar.case ? 'الحالة: ' + grammar.case : '', ...(grammar.parts || [])].filter(Boolean).join('\n'))}</p><p class="source-note">الإعراب خاص بهذا الموضع في الحديث.</p>` : '<div class="detail-empty">لم يُضف إعراب موثّق لهذا الموضع بعد.</div>';
                html += this.grammarReferenceHTML(id, hosni?.page);
                if (grammar) {
                    sourceURL = grammar.source;
                    sourceName = grammar.sourceTitle;
                }
                else {
                    sourceURL = this.grammarURL(this.reader.content.grammarNotes.chapterPages[id - 1]);
                    sourceName = this.reader.content.grammarNotes.sourceTitle;
                }
            }
            if (f === 'occurrences') {
                const hits = this.reader.hadithService.occurrences(w);
                html = `<div class="word-search-head"><span>${ar(hits.length)} موضعًا للكلمة نفسها بعد تجاهل التشكيل وعلامات الترقيم.</span></div><div class="word-occurrences">${hits.map(x => `<button data-hit-id="${x.id}" data-hit-word="${x.index}"><span>${esc(x.context)}</span><small>الحديث ${ar(x.id)} · الكلمة ${ar(x.index + 1)}</small></button>`).join('')}</div>`;
            }
        }
        else if (level === 'hadith') {
            if (f === 'text')
                html = `<p class="detail-prose">${esc(h.text)}</p>`;
            if (f === 'explanation') {
                html = this.explanationHTML(h);
                sourceURL = this.reader.content.commentary.find(x => x.id === id)?.source || 'https://shamela.ws/book/11244';
                sourceName = 'شرح الأربعين النووية — ابن دقيق العيد';
            }
            if (f === 'source')
                html = this.sourceHTML(h);
            if (f === 'note')
                html = `<label for="personal-note">ملاحظتك الشخصية على الحديث</label><textarea id="personal-note" rows="6" maxlength="10000" placeholder="فائدة، سؤال أو تذكير بالمراجعة…">${esc(this.reader.study.notes[id] || '')}</textarea><p class="source-note">تُحفظ تلقائيًا على هذا المتصفح. الملاحظات الشخصية مستقلة عن نص الحديث وشرحه.</p><span id="note-state" role="status"></span>`;
        }
        else if (level === 'page') {
            const page = this.reader.pages[this.reader.hadithService.pageFor(id, word || 0) - 1];
            html = f === 'text' ? `<p class="detail-prose">${esc(words(h).slice(page.start, page.end).join(' '))}</p>` : `<div class="surah-stats"><div><strong>${ar(page.number)}</strong><span>رقم الصفحة</span></div><div><strong>${ar(id)}</strong><span>رقم الحديث</span></div><div><strong>${ar(page.end - page.start)}</strong><span>كلمة في الصفحة</span></div><div><strong>${ar(page.part)}</strong><span>الجزء من الحديث</span></div></div><p class="source-note">تقسيم للقراءة داخل التطبيق، وليس ترقيمًا لطبعة ورقية بعينها.</p>`;
        }
        else {
            html = f === 'about' ? this.aboutHTML() : f === 'sources' ? this.sourcesHTML() : this.progressHTML();
        }
        $('#detail-body').innerHTML = html;
        $('#detail-source').innerHTML = link(sourceURL, sourceName);
        const saved = this.reader.study.isSaved(id, level === 'word' ? word : null);
        $('#detail-save').textContent = saved ? '▣' : '♧';
        $('#detail-save').setAttribute('aria-label', saved ? 'إزالة الإشارة' : 'حفظ الإشارة');
        $('#detail-save').setAttribute('aria-pressed', String(saved));
        $('#detail-note').textContent = 'كل كلمة تحمل موضعها في الحديث';
        $('.detail-navigation').hidden = level !== 'word';
        $('[data-action="previous-word"]').disabled = word === 0;
        $('[data-action="next-word"]').disabled = word === words(h).length - 1;
    }
    aboutHTML() {
        return `<div class="about-text"><p>الأربعون النووية مجموعة من اثنين وأربعين حديثًا جمعها الإمام يحيى بن شرف النووي.</p><p>اقرأ الأحاديث في صفحات واضحة، واستمع إلى متنها، وتعرّف إلى شرحها وتخريجها ومعاني كلماتها، وتابع رحلتك في القراءة والحفظ.</p><p>ترقيم الصفحات خاص بالتطبيق لتيسير القراءة، وقد يختلف عن ترقيم الطبعات الورقية.</p><p>تُحفظ إشاراتك وملاحظاتك وتقدّمك على هذا الجهاز. التسجيلات الشخصية التي تضيفها تبقى في متصفحك.</p></div>`;
    }
    sourcesHTML() {
        return `<div class="about-text"><h3>مصادر المحتوى</h3><p>${link('https://sunnah.com/nawawi40', 'المتن العربي وتخريج الأحاديث — Sunnah.com')}</p><p>${link('https://shamela.ws/book/11244', 'مقتطفات الشرح — شرح ابن دقيق العيد')}</p><p>${link('https://www.islamarchive.cc/ketab_content/12753/p-4', 'إعراب الأربعين النووية — عمر العمري')}</p><p>المعاني العربية والإنجليزية صياغات تعليمية موجزة لبيان المقصود في السياق. تُعرض ملاحظات شرح ابن دقيق العيد بمصدرها على حدة، وأرقام التخريج ليست كلمات من المتن.</p><h3>المعنى والإعراب</h3><p>معاني الكلمات متاحة بالعربية والإنجليزية، والشرح والإعراب بالعربية. تبقى عناوين الأحاديث بالعربية في اللغتين.</p><p>${link(this.reader.content.grammarNotes.catalog, this.reader.content.grammarNotes.sourceTitle)}</p><p class="source-note"><strong>${ar(this.reader.content.grammarNotes.notes.length)}</strong> <span>موضعًا بإعراب موجز من كتاب حسني يوسف عبر الأحاديث الـ٤٢، مع رقم الصفحة. المواضع المختلفة عن نص الكتاب أو غير المحققة تُحال إلى المصدر.</span></p><h3>مصادر الصوت</h3>${this.reader.audio.readerCatalogs().map(c => `<p>${link(c.source, c.reader)} · ${ar(c.recordings.length)} من ٤٢ حديثًا${c.availabilityNote ? ' — ' + esc(c.availabilityNote) : ''}</p>`).join('')}<p>تتوفر الأحاديث الـ٤٢ كاملة بصوت أحمد النفيس وبصوت أكاديمية الحسيني، ولكل حديث ملف صوتي متصل. قد تختلف بعض ألفاظ الروايات أو زيادات التخريج عن النص المعروض. يتوفر تظليل الكلمات أثناء الاستماع إلى الحديث كاملًا، في المواضع التي أمكن مطابقتها مع النص. لكل صوت توقيتاته المستقلة. التوقيتات آلية وقد تحتاج بعض حدود الكلمات إلى ضبط.</p><p>${link('audio-catalog.json', 'توثيق ملفات الصوت ومصادرها')} · ${link('licenses/Audio-collection-MIT.txt', 'ترخيص مكتبة أحمد النفيس الصوتية')}</p><p>النص المعروض يتبع ضبط مصدره؛ قد تختلف بعض الروايات أو علامات الترقيم بين الطبعات.</p></div>`;
    }
    showBookmarks() {
        this.modal('الإشارات المرجعية', `<div class="bookmark-tabs"><button data-action="export">تصدير بياناتي ↗</button><button data-action="import">استيراد بيانات</button></div><p class="source-note">${ar(this.reader.study.bookmarks.length)} إشارة محفوظة على هذا المتصفح</p>${this.reader.study.bookmarks.length ? this.reader.study.bookmarks.map(b => {
            const h = this.reader.getHadith(b.id);
            if (!h)
                return '';
            return `<div class="bookmark-item"><button data-open="${b.id}" ${b.word !== null ? 'data-at="' + b.word + '"' : ''}><small>الحديث ${ar(b.id)} · ${esc(h.title)}</small><p>${esc(b.word === null ? words(h).slice(0, 12).join(' ') + '…' : words(h)[b.word] || '')}</p></button><button class="icon" data-remove-id="${b.id}" data-remove-word="${b.word ?? ''}" aria-label="حذف الإشارة">×</button></div>`;
        }).join('') : '<p class="empty">احفظ حديثًا من شريط القراءة، أو كلمة من نافذة التفاصيل.</p>'}`);
    }
    progressHTML() {
        const count = this.reader.study.progress.filter(x => x.state === 'memorized').length, readCount = this.reader.study.progress.filter(x => x.state === 'read' || x.state === 'memorized').length;
        return `<div class="journey-summary"><b>${ar(count)} / ٤٢ حديثًا محفوظًا</b><progress value="${count}" max="42" aria-label="تقدم الحفظ"></progress><span>قرأت ${ar(readCount)} حديثًا. الخطوة الصغيرة تصنع الأثر.</span></div><div class="journey-list">${this.reader.hadiths.map(h => { const state = this.reader.study.progress.find(x => x.id === h.id)?.state; return `<div class="journey-row"><button data-open="${h.id}"><span>${ar(h.id)}</span> ${esc(h.title)}</button><select data-progress-id="${h.id}" aria-label="حالة الحديث ${ar(h.id)}"><option value="" ${!state ? 'selected' : ''}>لم أبدأ</option><option value="read" ${state === 'read' ? 'selected' : ''}>قرأته</option><option value="memorized" ${state === 'memorized' ? 'selected' : ''}>حفظته</option></select></div>`; }).join('')}</div>`;
    }
    showSettings() {
        this.modal('إعدادات القراءة', `<div class="setting"><label for="ui-language">لغة الواجهة</label><select id="ui-language" data-ui-language><option value="ar">العربية</option><option value="en">English</option></select></div>${this.reader.audio.readerSelector()}<div class="setting"><label for="font-size">حجم الخط</label><input id="font-size" type="range" min="22" max="38" value="${this.reader.settings.font}"></div><div class="setting"><label for="theme-select">السمة</label><select id="theme-select"><option value="light" ${this.reader.settings.theme === 'light' ? 'selected' : ''}>فاتح</option><option value="dark" ${this.reader.settings.theme === 'dark' ? 'selected' : ''}>داكن</option></select></div><div class="setting"><label for="spread">صفحتان على الشاشات الواسعة</label><input id="spread" type="checkbox" ${this.reader.settings.spread ? 'checked' : ''}></div><p class="source-note">صفحة واحدة على الجوال تلقائيًا. حجم الخط يطبّق على صفحات القراءة.</p><div class="settings-links"><button data-action="audio-library">مكتبة الاستماع</button><button data-action="progress">رحلة الحفظ ←</button><button data-action="export">تصدير الإشارات والملاحظات والتقدّم</button><button data-action="import">استيراد نسخة من بياناتك</button><button data-action="install">إضافة التطبيق إلى الشاشة الرئيسية</button></div>`);
    }
    destroy() { clearTimeout(this.toastTimer); }
}
