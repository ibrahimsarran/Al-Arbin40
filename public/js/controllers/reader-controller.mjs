import { ResearchController } from './research-controller.mjs';
import { words } from '../utils/domain.mjs';
import { HadithRepository } from '../repositories/hadith-repository.mjs';
import { StudyRepository } from '../repositories/study-repository.mjs';
import { AudioRepository } from '../repositories/audio-repository.mjs';
import { downloadKey } from '../utils/audio-key.mjs';
import { HadithService } from '../services/hadith-service.mjs';
import { StudyService } from '../services/study-service.mjs';
import { ReaderView } from '../views/reader-view.mjs';
import { AudioController } from './audio-controller.mjs';
import { $, esc, ar } from '../utils/ui-utils.mjs';
// Coordinates navigation and user actions; services own data and media behavior.
export class ReaderController {
    constructor({ contentRepository = new HadithRepository(), studyRepository = new StudyRepository(), audioRepository = new AudioRepository(), languageController = globalThis.arbaeenI18n, downloadService } = {}) {
        this.contentRepository = contentRepository;
        this.languageController = languageController;
        this.hadithService = new HadithService();
        this.study = new StudyService(studyRepository, this.hadithService, () => this.ui.toast('تعذّر الحفظ؛ قد تكون مساحة المتصفح ممتلئة.'));
        this.ui = new ReaderView(this);
        this.audio = new AudioController(this, audioRepository, downloadService);
        this.listeners = [];
        this.content = null;
        this.currentPage = 1;
        this.view = 'pages';
        this.homeTab = 'all';
        this.topic = 'all';
        this.query = '';
        this.detail = null;
        this.reading = false;
        this.settings = { theme: 'light', font: 26, spread: true, ...studyRepository.read('settings', {}) };
        this.narrow = window.innerWidth <= 760;
    }
    get hadiths() { return this.hadithService.hadiths; }
    get pages() { return this.hadithService.pages; }
    persist(key, value) { return this.study.save(key, value); }
    remember(id, word = 0) { this.study.remember(id, word); }
    toggleSave(id, word = null) {
        const changed = this.study.toggleBookmark(id, word);
        if (changed === null)
            return;
        this.ui.toast(changed ? 'حُفظت الإشارة' : 'أُزيلت الإشارة');
        if (this.detail)
            this.ui.renderDetail();
        if (this.reading)
            this.ui.renderReader();
    }
    setProgress(id, state) { this.study.setProgress(id, state); }
    getHadith(id) {
        return this.hadithService.getHadith(id);
    }
    current() {
        return this.getHadith(this.pages[this.currentPage - 1]?.id) || this.hadiths[0];
    }
    spread() {
        return this.settings.spread && window.innerWidth > 760;
    }
    listen(target, event, handler) {
        target.addEventListener(event, handler);
        this.listeners.push({
            target, event, handler
        });
    }
    applySettings() {
        document.body.classList.toggle('dark', this.settings.theme === 'dark');
        document.documentElement.style.setProperty('--qsize', this.settings.font + 'px');
        this.persist('settings', this.settings);
    }
    routeTo(id, word) {
        $('#dialog').close();
        $('#detail-dialog').close();
        location.hash = `read/${id}${word != null ? '/' + (word + 1) : ''}`;
    }
    goPage(n) {
        const p = this.pages[Math.max(0, Math.min(this.pages.length - 1, n - 1))];
        location.hash = `page/${p.number}`;
    }
    route() {
        if (!this.content)
            return;
        const m = location.hash.match(/^#read\/(\d+)(?:\/(\d+))?$/), p = location.hash.match(/^#page\/(\d+)$/);
        $('#detail-dialog').close();
        if (m && this.getHadith(m[1])) {
            const h = this.getHadith(m[1]);
            const at = Math.max(0, Math.min(words(h).length - 1, Number(m[2] || 1) - 1));
            this.currentPage = this.hadithService.pageFor(h.id, at);
            this.reading = true;
            this.remember(h.id, at);
            this.ui.renderReader();
            if (m[2])
                this.openDetail(h.id, at);
        }
        else if (p && this.pages[Number(p[1]) - 1]) {
            this.currentPage = Number(p[1]);
            this.reading = true;
            this.remember(this.current().id, this.pages[this.currentPage - 1].start);
            this.ui.renderReader();
        }
        else {
            document.title = 'الأربعون — قراءة وتدبّر';
            this.ui.showHome();
        }
        window.scrollTo?.({
            top: 0, behavior: 'instant'
        });
    }
    openDetail(id, word = null, filter) {
        const h = this.getHadith(id);
        if (!h)
            return;
        this.detail = {
            id: h.id, word, level: word === null ? 'hadith' : 'word', filter: filter || (word === null ? 'explanation' : (this.languageController?.locale === 'en' ? 'meaning-en' : 'meaning'))
        };
        $('#dialog').close();
        this.ui.renderDetail();
        if (!$('#detail-dialog').open)
            $('#detail-dialog').showModal();
    }
    async copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.ui.toast('تم النسخ');
        }
        catch {
            this.ui.modal('انسخ النص', `<textarea class="copy-text" rows="8" readonly>${esc(text)}</textarea>`);
            $('.copy-text').select();
        }
    }
    async share(id, word) {
        const h = this.getHadith(id), url = new URL(location.href);
        url.hash = `read/${id}${word !== null && word !== undefined ? '/' + (word + 1) : ''}`;
        const data = {
            title: h.title, text: `الأربعون النووية · الحديث ${ar(id)}`, url: url.href
        };
        try {
            if (navigator.share)
                await navigator.share(data);
            else
                await this.copy(url.href);
        }
        catch (e) {
            if (e.name !== 'AbortError')
                await this.copy(url.href);
        }
    }
    exportData() {
        const data = this.study.createBackup();
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {
            type: 'application/json'
        }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arbaeen-backup.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.ui.toast('تُصدّر بياناتك النصية؛ التسجيلات الصوتية لا تُضمّن في الملف.');
    }
    importData() {
        this.ui.modal('استيراد نسخة احتياطية', `<p>تُدمج الإشارات والتقدّم مع بياناتك. الملاحظات الموجودة في الملف تستبدل ملاحظات الأحاديث نفسها.</p><input id="import-backup" type="file" accept="application/json,.json" aria-label="ملف النسخة الاحتياطية"><p id="import-state" role="status"></p>`);
    }
    async handleClick(e) {
        const b = e.target.closest('button,a[data-action]');
        if (!b || b.disabled)
            return;
        const d = b.dataset;
        if (d.action)
            e.preventDefault();
        if (d.downloadId) {
            await this.audio.startDownloads([Number(d.downloadId)]);
            return;
        }
        if (d.removeDownload) {
            await this.audio.removeDownloads([downloadKey(this.audio.selectedReader, Number(d.removeDownload))]);
            return;
        }
        if (d.open) {
            this.routeTo(Number(d.open), d.at === undefined ? undefined : Number(d.at));
            return;
        }
        if (d.word !== undefined) {
            this.openDetail(Number(d.id), Number(d.word));
            return;
        }
        if (d.page) {
            this.goPage(Number(d.page));
            return;
        }
        if (d.sourceId) {
            this.openDetail(Number(d.sourceId), null, 'source');
            return;
        }
        if (d.detail) {
            this.openDetail(Number(d.detail));
            return;
        }
        if (d.tab) {
            this.homeTab = d.tab;
            this.ui.showHome();
            return;
        }
        if (d.topic) {
            this.topic = d.topic;
            this.ui.renderCatalog();
            return;
        }
        if (d.view) {
            this.view = d.view;
            this.ui.renderReader();
            return;
        }
        if (d.level) {
            this.detail.level = d.level;
            this.ui.renderDetail();
            return;
        }
        if (d.filter) {
            this.detail.filter = d.filter;
            this.ui.renderDetail();
            return;
        }
        if (d.setFilter) {
            this.detail.level = 'hadith';
            this.detail.filter = d.setFilter;
            this.ui.renderDetail();
            return;
        }
        if (d.hitId) {
            this.detail.id = Number(d.hitId);
            this.detail.word = Number(d.hitWord);
            this.detail.level = 'word';
            this.detail.filter = 'context';
            this.ui.renderDetail();
            return;
        }
        if (d.removeId) {
            this.toggleSave(Number(d.removeId), d.removeWord === '' ? null : Number(d.removeWord));
            this.ui.showBookmarks();
            return;
        }
        if (d.audioId) {
            $('#dialog').close();
            this.audio.playHadith(Number(d.audioId));
            return;
        }
        if (d.deleteAudio) {
            try {
                const id = Number(d.deleteAudio);
                if (id === this.audio.player.activeAudio) {
                    this.audio.player.clear();
                    $('#player').classList.add('hidden');
                }
                await this.audio.audioRepository.audioDelete(id);
                await this.audio.refreshRecordings();
                this.ui.modal('مكتبة الاستماع', this.audio.audioLibraryHTML(id));
                this.ui.toast('أُزيل التسجيل المحلي.');
            }
            catch {
                this.ui.toast('تعذّر حذف التسجيل');
            }
            return;
        }
        await this.handleAction(d.action);
    }
    async handleAction(a) {
        switch (a) {
            case "download-current": {
                if (this.audio.savedDownload(this.current().id))
                    this.ui.modal('مكتبة الاستماع', this.audio.audioLibraryHTML(this.current().id));
                else
                    await this.audio.startDownloads([this.current().id]);
                break;
            }
            case "download-selected": {
                await this.audio.startDownloads([Number($('#audio-hadith').value)]);
                break;
            }
            case "download-reader": {
                await this.audio.startDownloads(this.audio.readerCatalog().recordings.map(r => r.id));
                break;
            }
            case "cancel-download": {
                this.audio.downloadJob?.controller.abort();
                break;
            }
            case "remove-reader-downloads": {
                await this.audio.removeDownloads([...this.audio.downloads.values()].filter(r => r.readerId === this.audio.selectedReader).map(r => r.key));
                break;
            }
            case "skip-main": {
                $('#main').focus();
                $('#main').scrollIntoView?.({
                    block: 'start'
                });
                break;
            }
            case "resume": {
                if (this.study.last && this.getHadith(this.study.last.id))
                    this.routeTo(this.study.last.id, this.study.last.word);
                else
                    this.routeTo(1);
                break;
            }
            case "search": {
                this.query = '';
                this.homeTab = 'all';
                location.hash = '';
                this.ui.showHome();
                $('#search')?.focus();
                break;
            }
            case "clear-search": {
                this.query = '';
                this.ui.showHome();
                $('#search')?.focus();
                break;
            }
            case "bookmarks": {
                this.ui.showBookmarks();
                break;
            }
            case "theme": {
                this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
                this.applySettings();
                break;
            }
            case "settings": {
                this.ui.showSettings();
                break;
            }
            case "about": {
                this.ui.modal('عن التطبيق', this.ui.aboutHTML() + this.ui.sourcesHTML());
                break;
            }
            case "progress": {
                this.ui.modal('رحلة القراءة والحفظ', this.ui.progressHTML());
                break;
            }
            case "close-dialog": {
                $('#dialog').close();
                break;
            }
            case "close-detail": {
                $('#detail-dialog').close();
                this.detail = null;
                break;
            }
            case "expand-detail": {
                $('#detail-dialog').classList.toggle('expanded');
                break;
            }
            case "previous-word":
            case "next-word": {
                const at = this.detail.word + (a === 'next-word' ? 1 : -1);
                if (at >= 0 && at < words(this.getHadith(this.detail.id)).length) {
                    this.detail.word = at;
                    this.ui.renderDetail();
                }
                break;
            }
            case "follow-audio": {
                this.audio.followAudio = !this.audio.followAudio;
                this.audio.applyFollow();
                if (this.audio.followAudio)
                    this.audio.syncAudioHighlight();
                else
                    this.audio.setHighlight(null);
                break;
            }
            case "save-detail": {
                this.toggleSave(this.detail.id, this.detail.level === 'word' ? this.detail.word : null);
                break;
            }
            case "share-detail": {
                this.share(this.detail.id, this.detail.level === 'word' ? this.detail.word : null);
                break;
            }
            case "copy-detail": {
                const h = this.getHadith(this.detail.id), txt = this.detail.level === 'word' ? words(h)[this.detail.word] : h.text;
                this.copy(txt + '\n\nالأربعون النووية · الحديث ' + ar(h.id) + '\n' + h.source);
                break;
            }
            case "save-current": {
                this.toggleSave(this.current().id);
                break;
            }
            case "note-current": {
                this.openDetail(this.current().id, null, 'note');
                break;
            }
            case "focus": {
                this.ui.setFocus(!document.body.classList.contains('fullscreen'));
                break;
            }
            case "mark-read": {
                const h = this.current();
                if (!this.study.progress.some(x => x.id === h.id))
                    this.setProgress(h.id, 'read');
                this.ui.renderReader();
                this.ui.toast('سُجّلت قراءتك.');
                break;
            }
            case "share-current": {
                this.share(this.current().id, null);
                break;
            }
            case "play-current": {
                this.audio.playHadith(this.current().id);
                break;
            }
            case "audio-library": {
                this.ui.modal('مكتبة الاستماع', this.audio.audioLibraryHTML(this.audio.player.activeAudio || this.current()?.id || 1));
                break;
            }
            case "play-selected": {
                const id = Number($('#audio-hadith').value);
                $('#dialog').close();
                this.audio.playHadith(id);
                if (this.reading)
                    this.routeTo(id);
                break;
            }
            case "toggle-audio": {
                if (this.audio.player.audio.error && this.audio.player.activeAudio) {
                    this.audio.playHadith(this.audio.player.activeAudio, false, this.audio.player.activeRecording);
                }
                else if (this.audio.player.audio.paused) {
                    try {
                        await this.audio.player.audio.play();
                    }
                    catch {
                        this.ui.toast('تعذّر التشغيل');
                    }
                }
                else
                    this.audio.player.audio.pause();
                break;
            }
            case "close-player": {
                this.audio.closePlayer();
                break;
            }
            case "rewind": {
                this.audio.player.seekControl.seekTo(Math.max(0, this.audio.player.audio.currentTime - 10));
                break;
            }
            case "forward": {
                this.audio.player.seekControl.seekTo(this.audio.player.audio.currentTime + 10);
                break;
            }
            case "repeat": {
                this.audio.player.setRepeat(!this.audio.player.repeat);
                $('#repeat').setAttribute('aria-pressed', String(this.audio.player.repeat));
                $('#repeat').classList.toggle('active', this.audio.player.repeat);
                this.audio.updateAudioStatus();
                this.ui.toast(this.audio.player.repeat ? 'تكرار الحديث مفعّل' : 'الاستماع المتتابع مفعّل');
                break;
            }
            case "export": {
                this.exportData();
                break;
            }
            case "import": {
                this.importData();
                break;
            }
            case "install": {
                this.ui.modal('التطبيق على جوالك', '<div class="about-text"><p>في Safari على iPhone: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية».</p><p>في Chrome على Android: افتح قائمة المتصفح ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p><p>بعد فتح التطبيق مرة، تتاح النصوص والشرح المحمّل دون اتصال في المتصفحات الداعمة.</p></div>');
                break;
            }
        }
    }
    handleInput(e) {
        const t = e.target;
        if (t.id === 'search') {
            this.query = t.value;
            this.ui.renderCatalog();
            $('[data-action="clear-search"]').hidden = !this.query;
        }
        if (t.id === 'font-size') {
            this.settings.font = Number(t.value);
            this.applySettings();
        }
        if (t.id === 'personal-note') {
            $('#note-state').textContent = this.study.saveNote(this.detail.id, t.value) ? 'تم الحفظ' : 'تعذّر الحفظ';
        }
    }
    async handleChange(e) {
        const t = e.target;
        if (t.matches('[data-reader-select]')) {
            await this.audio.changeReader(t.value);
            return;
        }
        if (t.id === 'audio-hadith')
            this.audio.paintDownloads();
        if (t.id === 'hadith-select')
            this.routeTo(Number(t.value));
        if (t.id === 'page-select')
            this.goPage(Number(t.value));
        if (t.id === 'theme-select') {
            this.settings.theme = t.value;
            this.applySettings();
        }
        if (t.id === 'spread') {
            this.settings.spread = t.checked;
            this.applySettings();
            this.ui.renderReader();
        }
        if (t.id === 'audio-speed') {
            this.audio.player.setSpeed(t.value);
        }
        if (t.dataset.progressId) {
            this.setProgress(Number(t.dataset.progressId), t.value);
            if (this.detail?.level === 'book')
                this.ui.renderDetail();
            else
                this.ui.modal('رحلة القراءة والحفظ', this.ui.progressHTML());
            if (this.reading)
                this.ui.renderReader();
            else
                this.ui.renderCatalog();
        }
        if (t.id === 'import-backup')
            await this.importBackupFile(t);
        if (t.id === 'audio-upload')
            await this.importAudioFile(t);
    }
    async importBackupFile(t) {
        const file = t.files?.[0];
        if (!file)
            return;
        const state = $('#import-state');
        try {
            if (file.size > 2 * 1024 * 1024)
                throw Error('الملف أكبر من الحد المسموح');
            const saved = this.study.mergeBackup(JSON.parse(await file.text()));
            state.textContent = saved ? 'تم استيراد بياناتك.' : 'تعذّر حفظ بعض البيانات.';
            if (this.reading)
                this.ui.renderReader();
            else
                this.ui.renderCatalog();
        }
        catch (err) {
            state.textContent = 'تعذّر الاستيراد: ' + err.message;
        }
    }
    async importAudioFile(t) {
        const file = t.files?.[0];
        if (!file)
            return;
        const id = Number($('#upload-hadith').value), state = $('#upload-state');
        state.textContent = 'جارٍ حفظ التسجيل على جهازك…';
        try {
            this.audio.player.clear();
            $('#player').classList.add('hidden');
            await this.audio.audioRepository.audioPut(id, file);
            await this.audio.refreshRecordings();
            this.ui.modal('مكتبة الاستماع', this.audio.audioLibraryHTML(id));
            $('#upload-state').textContent = 'تم حفظ التسجيل. يمكنك تشغيله من القائمة أدناه.';
        }
        catch (err) {
            state.textContent = err.message;
        }
    }
    handleKeyDown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || e.ctrlKey || e.metaKey || e.altKey)
            return;
        if (e.key === '/' && !$('#detail-dialog').open && !$('#dialog').open) {
            e.preventDefault();
            this.query = '';
            location.hash = '';
            this.ui.showHome();
            $('#search').focus();
        }
        if (e.key === 'Escape')
            this.ui.setFocus(false);
        if (this.reading && !$('#detail-dialog').open && !$('#dialog').open) {
            if (e.key === 'ArrowLeft')
                this.goPage(Math.min(this.pages.length, this.currentPage + (this.spread() ? 2 : 1)));
            if (e.key === 'ArrowRight')
                this.goPage(Math.max(1, this.currentPage - (this.spread() ? 2 : 1)));
        }
    }
    handleResize() {
        const narrow = window.innerWidth <= 760;
        if (narrow !== this.narrow) {
            this.narrow = narrow;
            this.ui.renderReader();
        }
    }
    bindEvents() {
        this.listen(document, 'click', e => this.handleClick(e));
        this.listen(document, 'input', e => this.handleInput(e));
        this.listen(document, 'change', e => this.handleChange(e));
        this.listen(document, 'keydown', e => this.handleKeyDown(e));
        this.listen(window, 'hashchange', () => this.route());
        this.listen(window, 'resize', () => this.handleResize());
    }
    async start() {
        try {
            this.content = await this.contentRepository.loadContent();
            this.hadithService.load(this.content.hadiths, this.content.commentary, this.content.glossary);
            this.research = new ResearchController(this);
            await this.audio.start();
            this.applySettings();
            this.route();
            if ('serviceWorker' in navigator)
                navigator.serviceWorker.register('service-worker.js').catch(() => { });
            this.bindEvents();
        }
        catch (error) {
            $('#main').innerHTML = '<div class="empty"><h1>تعذّر فتح الكتاب</h1><p>تحقق من اتصالك ثم أعد تحميل الصفحة.</p><a href="" class="primary">إعادة المحاولة</a></div>';
            console.error(error);
            throw error;
        }
        return this;
    }
    destroy() {
        this.research?.destroy();
        this.audio.destroy();
        this.ui.destroy();
        for (const { target, event, handler } of this.listeners)
            target.removeEventListener(event, handler);
        this.listeners = [];
    }
}
