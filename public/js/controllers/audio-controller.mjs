import { buildTimingIndex, timedWord, wordAt } from '../utils/timing.mjs';
import { downloadKey } from '../utils/audio-key.mjs';
import { $, $$, esc, ar, link, glyph, megabytes, time } from '../utils/ui-utils.mjs';
import { AudioPlayer } from '../audio/audio-player.mjs';
import { AudioDownloadService } from '../services/audio-download-service.mjs';
// Owns reader selection, media playback, verified downloads and timed highlighting.
export class AudioController {
    constructor(reader, audioRepository, downloadService) {
        this.reader = reader;
        this.audioRepository = audioRepository;
        this.downloadService = downloadService || new AudioDownloadService(audioRepository);
        this.downloads = new Map();
        this.recordings = new Map();
        this.downloadJob = null;
        this.downloadNotice = '';
        this.downloadStorageError = '';
        this.selectedReader = reader.study.repository.read('audio-reader', 'alnufais');
        this.followAudio = reader.study.repository.read('follow-audio', true);
        this.timingIndexes = new Map();
        this.timingIndex = new Map();
        this.highlight = null;
        this.followFrame = 0;
        this.listeners = [];
        this.player = new AudioPlayer($('#audio'), { range: $('#seek'), clock: $('#audio-time'), onError: () => reader.ui.toast('تعذّر الانتقال؛ انتظر تحميل التسجيل وأعد المحاولة.') });
    }
    async start() {
        for (const catalog of this.readerCatalogs())
            this.timingIndexes.set(catalog.id, buildTimingIndex(this.reader.hadiths, this.reader.content.readerTimings.get(catalog.id), catalog));
        if (!this.timingIndexes.has(this.selectedReader))
            this.selectedReader = this.reader.content.audioCatalog.id;
        this.timingIndex = this.timingIndexes.get(this.selectedReader);
        $('#player-voice').innerHTML = this.readerSelector();
        await Promise.allSettled([this.refreshRecordings(), this.restoreDownloads()]);
        this.applyFollow();
        this.bindEvents();
    }
    listen(target, event, handler) { target.addEventListener(event, handler); this.listeners.push({ target, event, handler }); }
    bindEvents() {
        this.listen(this.player.audio, 'play', () => {
            $('#play-audio').textContent = 'Ⅱ';
            $('#play-audio').setAttribute('aria-label', 'إيقاف مؤقت');
        });
        this.listen(this.player.audio, 'pause', () => {
            $('#play-audio').textContent = '▶';
            $('#play-audio').setAttribute('aria-label', 'تشغيل');
        });
        this.listen(this.player.audio, 'error', () => {
            $('#audio-status').textContent = 'تعذّر تحميل التسجيل. تحقق من الاتصال، ثم اضغط تشغيل لإعادة المحاولة.';
            $('#play-audio').textContent = '▶';
        });
        this.listen(this.player.audio, 'waiting', () => {
            if (this.player.activeAudio)
                $('#audio-status').textContent = 'جارٍ تحميل الصوت…';
        });
        this.listen(this.player.audio, 'playing', () => {
            this.updateAudioStatus();
            this.startFollowLoop();
        });
        this.listen(this.player.audio, 'pause', () => {
            this.stopFollowLoop();
            this.setHighlight(null);
        });
        this.listen(this.player.audio, 'seeked', (...args) => this.syncAudioHighlight(...args));
        this.listen(this.player.audio, 'ended', (...args) => this.advanceAudio(...args));
        this.listen(window, 'online', () => this.paintDownloads());
        this.listen(window, 'offline', () => this.paintDownloads());
    }
    async refreshRecordings() {
        for (const x of this.recordings.values())
            URL.revokeObjectURL(x.url);
        this.recordings = new Map((await this.audioRepository.audioGetAll()).map(x => [x.id, {
                ...x, url: URL.createObjectURL(x.file)
            }]));
    }
    readerCatalogs() {
        return [this.reader.content.audioCatalog, ...(this.reader.content.audioCatalog.alternatives || [])];
    }
    readerCatalog() {
        return this.readerCatalogs().find(c => c.id === this.selectedReader) || this.reader.content.audioCatalog;
    }
    readerSelector() {
        return `<label class="reader-voice"><span>القارئ</span> <select data-reader-select aria-label="اختيار القارئ">${this.readerCatalogs().map(c => `<option value="${esc(c.id)}" ${c.id === this.selectedReader ? 'selected' : ''}>${esc(c.reader)}${c.recordings.length < 42 ? ' · ' + ar(c.recordings.length) + ' من ٤٢' : ''}</option>`).join('')}</select></label>`;
    }
    bundledRecording(id) {
        return this.readerCatalog().recordings.find(r => r.id === id) || null;
    }
    async changeReader(id) {
        if (id === this.selectedReader || !this.readerCatalogs().some(c => c.id === id))
            return;
        const previousId = this.player.activeAudio, wasPlaying = !this.player.audio.paused, oldWord = previousId ? wordAt(this.timingIndex, previousId, this.player.audio.currentTime, this.player.activeRecording) : null;
        this.stopFollowLoop();
        this.setHighlight(null);
        this.player.clear();
        $('#player').classList.add('hidden');
        this.selectedReader = id;
        this.reader.persist('audio-reader', id);
        this.timingIndex = this.timingIndexes.get(id) || new Map();
        const libraryTarget = $('#dialog').open ? $('#audio-hadith')?.value : null;
        if (this.reader.reading)
            this.reader.ui.renderReader();
        $$('[data-reader-select]').forEach(el => el.value = id);
        if ($('#detail-dialog').open && this.reader.detail)
            this.reader.ui.renderDetail();
        if (libraryTarget)
            this.reader.ui.modal('مكتبة الاستماع', this.audioLibraryHTML(Number(libraryTarget)));
        const r = previousId ? this.recordingFor(previousId) : null;
        if (r) {
            const span = oldWord ? timedWord(this.timingIndex, previousId, oldWord.index, r) : null;
            await this.playHadith(previousId, false, r, span?.start || 0, wasPlaying);
        }
        else if (previousId) {
            this.reader.ui.toast('هذا الحديث غير متاح بالصوت المختار. اختر تسجيلًا من مكتبة الاستماع.');
        }
    }
    savedDownload(id, readerId = this.selectedReader) {
        const catalog = this.readerCatalogs().find(c => c.id === readerId), row = this.downloads.get(downloadKey(readerId, id));
        return this.downloadService.matches(row, catalog?.recordings.find(r => r.id === id)) ? row : null;
    }
    downloadedRecording(id) {
        const row = this.savedDownload(id);
        if (!row)
            return null;
        row.url ??= URL.createObjectURL(row.file);
        return {
            ...this.bundledRecording(id), url: row.url, offline: true, downloadKey: row.key
        };
    }
    recordingFor(id) {
        return this.recordings.get(id) || this.downloadedRecording(id) || this.bundledRecording(id);
    }
    canPlayOffline(id) {
        return this.recordings.has(id) || Boolean(this.savedDownload(id));
    }
    closePlayer() {
        this.stopFollowLoop();
        this.setHighlight(null);
        this.player.clear();
        $('#player').classList.add('hidden');
    }
    recordingLabel(r) {
        return r.alternative ? r.name : r.reader ? `قراءة ${r.reader}` : 'تسجيلك الشخصي';
    }
    audioLibraryHTML(id) {
        const target = this.reader.getHadith(id) || this.reader.current(), catalog = this.readerCatalog(), available = this.reader.hadiths.filter(h => this.recordingFor(h.id)), selected = available.find(h => h.id === target.id) || available[0];
        return `<div class="about-text">${this.readerSelector()}<p>قراءة ${esc(catalog.reader)} · ${ar(catalog.recordings.length)} من ٤٢ حديثًا.</p>${catalog.availabilityNote ? `<p class="source-note">${esc(catalog.availabilityNote)}</p>` : '<p>كل حديث في ملف متصل، ويبدأ الحديث التالي تلقائيًا عند انتهاء التسجيل.</p>'}<p class="source-note">فعّل «تتبّع القراءة» لتظليل الكلمة المقروءة. لكل صوت توقيتاته المستقلة. التسجيلات الشخصية لا تستخدم توقيتات القراءة المضمّنة.</p><label for="audio-hadith">اختر الحديث</label><select id="audio-hadith">${this.reader.hadiths.map(h => `<option value="${h.id}" ${h.id === selected?.id ? 'selected' : ''} ${this.recordingFor(h.id) ? '' : 'disabled'}>${ar(h.id)}. ${esc(h.title)}${this.recordingFor(h.id) ? '' : ' — غير متاح بهذا الصوت'}</option>`).join('')}</select><div id="offline-tools">${this.offlineToolsHTML(target.id)}</div><p><button class="primary" data-action="play-selected" ${selected ? '' : 'disabled'}>▷ تشغيل والاستمرار بالتتابع</button></p><div class="recording-list">${available.map(h => { const r = this.recordingFor(h.id); return `<div class="recording-row" data-recording-id="${h.id}"><button data-audio-id="${h.id}">▷ ${ar(h.id)}. ${esc(h.title)}<small>${esc(this.recordingLabel(r))}${r.duration ? ' · ' + time(r.duration) : ''}</small><small class="recording-offline-status">${this.savedDownload(h.id) ? '✓ متاح دون إنترنت' : this.recordings.has(h.id) ? 'تسجيلك الشخصي محفوظ' : 'يحتاج اتصالًا أو تنزيلًا'}</small></button><button class="recording-download" data-download-id="${h.id}" aria-label="تنزيل الحديث ${ar(h.id)}" title="تنزيل للاستماع دون إنترنت" ${this.savedDownload(h.id) ? 'hidden' : ''} ${this.downloadJob || this.downloadStorageError || navigator.onLine === false ? 'disabled' : ''}>${glyph('download')}</button><button class="recording-download" data-remove-download="${h.id}" aria-label="حذف تنزيل الحديث ${ar(h.id)}" title="حذف التنزيل" ${this.savedDownload(h.id) ? '' : 'hidden'} ${this.downloadJob ? 'disabled' : ''}>${glyph('trash')}</button>${this.recordings.has(h.id) ? `<button data-delete-audio="${h.id}" aria-label="حذف تسجيل الحديث ${ar(h.id)}">×</button>` : ''}</div>`; }).join('')}</div><details class="personal-recordings"><summary>التسجيلات الشخصية</summary><label for="upload-hadith">الحديث الخاص بالتسجيل</label><select id="upload-hadith">${this.reader.hadiths.map(h => `<option value="${h.id}" ${h.id === target.id ? 'selected' : ''}>${ar(h.id)}. ${esc(h.title)}</option>`).join('')}</select><label for="audio-upload" class="upload-label">إضافة تسجيل لهذا الحديث</label><input id="audio-upload" type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav"><p class="source-note">اختر تسجيلًا بشريًا مطابقًا للحديث كاملًا، بحد أقصى ١٠٠ MB. تسجيلك الشخصي له أولوية التشغيل؛ بحذفه تعود القراءة المختارة.</p><p id="upload-state" role="status"></p></details><p>${link(catalog.source, 'مصدر القراءة — ' + catalog.reader)}</p></div>`;
    }
    async restoreDownloads() {
        try {
            this.downloads = new Map((await this.audioRepository.downloadGetAll()).map(row => [row.key, row]));
        }
        catch (error) {
            this.downloadStorageError = error.message || 'حفظ الصوت غير متاح في هذا المتصفح.';
        }
    }
    offlineToolsHTML(id) {
        const catalog = this.readerCatalog(), saved = catalog.recordings.filter(r => this.savedDownload(r.id)), missing = catalog.recordings.filter(r => !this.savedDownload(r.id)), selected = catalog.recordings.find(r => r.id === id) || catalog.recordings[0], allBytes = [...this.downloads.values()].reduce((n, r) => n + r.bytes, 0), blocked = Boolean(this.downloadJob || this.downloadStorageError || navigator.onLine === false);
        return `<section class="offline-panel" aria-label="تنزيلات الصوت"><div class="offline-heading"><h3>الاستماع دون إنترنت</h3><span>${ar(saved.length)} / ${ar(catalog.recordings.length)} محفوظ</span></div><p class="source-note">اختر حديثًا أو نزّل قراءة ${esc(catalog.reader)} كاملة. حجم تنزيلاتك على هذا المتصفح: <b dir="auto">${megabytes(allBytes)}</b>.</p><div class="offline-actions"><button data-action="download-selected" ${blocked || this.savedDownload(selected.id) ? 'disabled' : ''}>${glyph('download')}<span>${this.savedDownload(selected.id) ? 'الحديث المختار منزّل' : 'تنزيل الحديث المختار · ' + megabytes(selected.bytes)}</span></button><button data-action="download-reader" ${blocked || !missing.length ? 'disabled' : ''}>${missing.length ? 'تنزيل القارئ كاملًا · ' + megabytes(missing.reduce((n, r) => n + r.bytes, 0)) : '✓ القراءة كاملة محفوظة'}</button></div>${this.downloadJob ? `<div class="download-task"><p id="download-progress-text" role="status">${esc(this.downloadProgressText())}</p><progress id="download-progress" value="${this.downloadJob.completedBytes + this.downloadJob.loaded}" max="${this.downloadJob.totalBytes}" aria-label="تقدم تنزيل الصوت"></progress><button data-action="cancel-download">إلغاء التنزيل</button></div>` : ''}<p id="download-notice" class="download-notice" role="status">${esc(this.downloadStorageError || this.downloadNotice || (navigator.onLine === false ? 'أنت دون اتصال؛ شغّل الأحاديث المحفوظة على جهازك.' : ''))}</p><div class="offline-foot"><span>تبقى التنزيلات على هذا المتصفح؛ حذف بيانات الموقع يحذفها.</span><button data-action="remove-reader-downloads" ${this.downloadJob ? 'disabled' : ''} ${[...this.downloads.values()].some(r => r.readerId === this.selectedReader) ? '' : 'hidden'}>حذف تنزيلات هذا القارئ</button></div></section>`;
    }
    downloadProgressText() {
        if (!this.downloadJob)
            return '';
        return `تنزيل ${this.downloadJob.readerName} · ${ar(this.downloadJob.done)} من ${ar(this.downloadJob.total)} مكتمل · الحديث ${ar(this.downloadJob.currentId)}`;
    }
    paintDownloadProgress() {
        if (!this.downloadJob)
            return;
        const bar = $('#download-progress');
        if (bar) {
            bar.max = this.downloadJob.totalBytes;
            bar.value = this.downloadJob.completedBytes + this.downloadJob.loaded;
        }
        const label = $('#download-progress-text');
        if (label)
            label.textContent = this.downloadProgressText();
        const inline = $('#reader-download-state');
        if (inline) {
            inline.hidden = false;
            inline.textContent = this.downloadProgressText();
        }
    }
    paintDownloads() {
        const target = Number($('#audio-hadith')?.value) || this.reader.current()?.id || 1;
        if ($('#offline-tools'))
            $('#offline-tools').innerHTML = this.offlineToolsHTML(target);
        $$('.recording-row[data-recording-id]').forEach(el => {
            const id = Number(el.dataset.recordingId), saved = this.savedDownload(id);
            el.querySelector('.recording-offline-status').textContent = saved ? '✓ متاح دون إنترنت' : this.recordings.has(id) ? 'تسجيلك الشخصي محفوظ' : 'يحتاج اتصالًا أو تنزيلًا';
            const down = el.querySelector('[data-download-id]'), remove = el.querySelector('[data-remove-download]');
            down.hidden = Boolean(saved);
            down.disabled = Boolean(this.downloadJob || this.downloadStorageError || navigator.onLine === false);
            remove.hidden = !saved;
            remove.disabled = Boolean(this.downloadJob);
        });
        const button = $('.download-current');
        if (button) {
            const saved = this.savedDownload(this.reader.current().id);
            button.disabled = Boolean(this.downloadJob || this.downloadStorageError || navigator.onLine === false && !saved);
            button.querySelector('span').textContent = saved ? 'منزّل' : 'تنزيل';
            button.setAttribute('aria-label', saved ? 'إدارة تنزيل الحديث' : 'تنزيل الحديث للاستماع دون إنترنت');
        }
        const inline = $('#reader-download-state');
        if (inline) {
            inline.hidden = !this.downloadJob;
            inline.textContent = this.downloadJob ? this.downloadProgressText() : '';
        }
    }
    async startDownloads(ids) {
        if (this.downloadJob)
            return;
        if (this.downloadStorageError) {
            this.reader.ui.toast(this.downloadStorageError);
            return;
        }
        if (navigator.onLine === false) {
            this.reader.ui.toast('اتصل بالإنترنت لتنزيل الأحاديث أولًا.');
            return;
        }
        const catalog = this.readerCatalog(), files = catalog.recordings.filter(r => ids.includes(r.id) && !this.savedDownload(r.id, catalog.id));
        if (!files.length) {
            this.reader.ui.toast('هذا الصوت محفوظ بالفعل على جهازك.');
            return;
        }
        const job = {
            readerId: catalog.id, readerName: catalog.reader, controller: new AbortController(), total: files.length, done: 0, currentId: files[0].id, totalBytes: files.reduce((n, r) => n + r.bytes, 0), completedBytes: 0, loaded: 0
        };
        this.downloadJob = job;
        this.downloadNotice = '';
        this.paintDownloads();
        try {
            for (const recording of files) {
                job.controller.signal.throwIfAborted();
                job.currentId = recording.id;
                job.loaded = 0;
                this.paintDownloadProgress();
                const row = await this.downloadService.download(job.readerId, recording, {
                    signal: job.controller.signal, onProgress: (loaded) => {
                        job.loaded = loaded;
                        this.paintDownloadProgress();
                    }
                });
                const old = this.downloads.get(row.key);
                if (old?.url)
                    URL.revokeObjectURL(old.url);
                this.downloads.set(row.key, row);
                job.done++;
                job.completedBytes += row.bytes;
                job.loaded = 0;
                this.paintDownloads();
            }
            this.downloadNotice = `تم حفظ ${ar(job.done)} ${job.done === 1 ? 'حديث' : 'حديثًا'} بصوت ${job.readerName} للاستماع دون إنترنت.`;
            this.reader.ui.toast(this.downloadNotice);
        }
        catch (error) {
            this.downloadNotice = this.downloadService.errorMessage(error);
            this.reader.ui.toast(this.downloadNotice);
        }
        finally {
            this.downloadJob = null;
            this.paintDownloads();
        }
    }
    async removeDownloads(keys) {
        if (this.downloadJob || !keys.length)
            return;
        try {
            await this.audioRepository.downloadDelete(keys);
            if (this.player.activeRecording?.offline && keys.includes(this.player.activeRecording.downloadKey))
                this.closePlayer();
            for (const key of keys) {
                const row = this.downloads.get(key);
                if (row?.url)
                    URL.revokeObjectURL(row.url);
                this.downloads.delete(key);
            }
            this.downloadNotice = 'حُذفت التنزيلات المختارة من هذا المتصفح.';
            this.paintDownloads();
            this.reader.ui.toast(this.downloadNotice);
        }
        catch (error) {
            this.reader.ui.toast(this.downloadService.errorMessage(error));
        }
    }
    updateAudioStatus() {
        if (!this.player.activeRecording)
            return;
        const set = this.timingIndex.get(this.player.activeAudio), matched = Boolean(set && set.audioSha256 === this.player.activeRecording.sha256);
        $('#follow-audio').disabled = !matched;
        $('#follow-audio').title = matched ? 'تتبّع الكلمة المقروءة' : 'التتبّع متاح للتسجيلات المطابقة لتوقيتاتها';
        $('#audio-status').textContent = this.recordingLabel(this.player.activeRecording) + (this.player.activeRecording.offline ? ' · من تنزيلاتك' : '') + (this.player.repeat ? ' · تكرار الحديث' : ' · استماع متتابع') + (matched ? '' : ' · دون تظليل للكلمات');
    }
    updatePlayButton() {
        $('#play-audio').textContent = this.player.audio.paused ? '▶' : 'Ⅱ';
        $('#play-audio').setAttribute('aria-label', this.player.audio.paused ? 'تشغيل' : 'إيقاف مؤقت');
    }
    async playHadith(id, automatic = false, override = null, startAt = 0, shouldPlay = true) {
        const r = override || this.recordingFor(id);
        if (r && navigator.onLine === false && !r.offline && !this.recordings.has(id)) {
            const message = 'هذا الحديث غير منزّل. اتصل بالإنترنت لتنزيله أولًا.';
            if (automatic)
                $('#audio-status').textContent = message;
            else
                this.reader.ui.toast(message);
            return;
        }
        if (!r) {
            if (automatic) {
                $('#audio-status').textContent = `لا يتوفر تسجيل للحديث ${ar(id)}.`;
                return;
            }
            this.reader.ui.modal('مكتبة الاستماع', this.audioLibraryHTML(id));
            return;
        }
        $('#player').classList.remove('hidden');
        $('#audio-title').textContent = `الحديث ${ar(id)} · ${this.reader.getHadith(id).title}`;
        $('#audio-status').textContent = 'جارٍ تحميل التسجيل…';
        try {
            const active = await this.player.play(id, r, {
                startAt, shouldPlay, speed: Number($('#audio-speed').value)
            });
            if (!active)
                return;
            this.updatePlayButton();
            this.updateAudioStatus();
            if (shouldPlay)
                this.startFollowLoop();
        }
        catch (error) {
            $('#audio-status').textContent = error.name === 'NotAllowedError' ? 'اضغط تشغيل لمتابعة الاستماع.' : 'تعذّر تشغيل التسجيل؛ تحقق من الاتصال وأعد المحاولة.';
        }
    }
    advanceAudio() {
        this.stopFollowLoop();
        this.setHighlight(null);
        if (!this.player.activeAudio || this.player.repeat)
            return;
        if (this.player.activeAudio === 42) {
            $('#audio-status').textContent = 'اكتمل الاستماع إلى الأحاديث.';
            return;
        }
        const next = this.player.activeAudio + 1;
        if (navigator.onLine === false && !this.canPlayOffline(next)) {
            $('#audio-status').textContent = 'الحديث التالي غير منزّل؛ انتهى الاستماع دون إنترنت. يمكنك اختيار حديث محفوظ.';
            return;
        }
        if (!this.recordingFor(next)) {
            $('#audio-status').textContent = 'انتهت التسجيلات المتاحة لهذا الصوت. يمكنك اختيار قارئ آخر.';
            return;
        }
        this.playHadith(next, true);
        if (this.reader.reading)
            this.reader.routeTo(next);
    }
    applyFollow() {
        this.reader.persist('follow-audio', this.followAudio);
        $('#follow-audio').setAttribute('aria-pressed', String(this.followAudio));
        $('#follow-audio').classList.toggle('active', this.followAudio);
    }
    setHighlight(next) {
        if (this.highlight?.id === next?.id && this.highlight?.index === next?.index)
            return;
        $$('.hadith-word.word-playing').forEach(el => {
            el.classList.remove('word-playing');
            el.removeAttribute('aria-current');
        });
        this.highlight = next;
        if (!next)
            return;
        $$(`.hadith-word[data-id="${next.id}"][data-word="${next.index}"]`).forEach(el => {
            el.classList.add('word-playing');
            el.setAttribute('aria-current', 'true');
        });
    }
    syncAudioHighlight() {
        if (!this.followAudio || this.player.audio.paused || !this.player.activeAudio) {
            this.setHighlight(null);
            return;
        }
        const segment = wordAt(this.timingIndex, this.player.activeAudio, this.player.audio.currentTime, this.player.activeRecording);
        if (!segment) {
            this.setHighlight(null);
            return;
        }
        const next = {
            id: this.player.activeAudio, index: segment.index
        };
        if (this.reader.reading && !$('#detail-dialog').open && !$('#dialog').open) {
            const p = this.reader.hadithService.pageFor(next.id, next.index), visible = this.reader.pages.slice(this.reader.currentPage - 1, this.reader.currentPage + (this.reader.spread() ? 1 : 0));
            if (!visible.some(x => x.number === p)) {
                this.reader.currentPage = p;
                history.replaceState(null, '', `#page/${p}`);
                this.reader.remember(next.id, next.index);
                this.reader.ui.renderReader();
            }
        }
        const changed = this.highlight?.id !== next.id || this.highlight?.index !== next.index;
        this.setHighlight(next);
        if (changed && this.reader.reading && !$('#detail-dialog').open && !$('#dialog').open) {
            const el = $(`.hadith-word.word-playing`), rect = el?.getBoundingClientRect();
            if (rect?.height && (rect.top < 80 || rect.bottom > window.innerHeight - 160))
                el.scrollIntoView?.({
                    block: 'center', behavior: 'smooth'
                });
        }
    }
    stopFollowLoop() {
        cancelAnimationFrame(this.followFrame);
        this.followFrame = 0;
    }
    startFollowLoop() {
        this.stopFollowLoop();
        const tick = () => {
            if (this.player.audio.paused)
                return;
            this.syncAudioHighlight();
            this.followFrame = requestAnimationFrame(tick);
        };
        tick();
    }
    destroy() {
        this.downloadJob?.controller.abort();
        this.stopFollowLoop();
        this.player.destroy();
        for (const { target, event, handler } of this.listeners)
            target.removeEventListener(event, handler);
        this.listeners = [];
        for (const row of [...this.recordings.values(), ...this.downloads.values()])
            if (row.url)
                URL.revokeObjectURL(row.url);
    }
}
