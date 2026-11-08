import { sha256 } from '../../vendor/sha256.mjs';
import { downloadKey } from '../utils/audio-key.mjs';
function matchingDownload(row, recording) {
    return Boolean(row && recording && row.sha256 === recording.sha256 && row.bytes === recording.bytes && row.file?.size === recording.bytes);
}
function downloadError(error) {
    if (error?.name === 'AbortError')
        return 'أُوقف التنزيل. تبقى الأحاديث التي اكتمل حفظها متاحة.';
    if (error?.name === 'QuotaExceededError')
        return 'المساحة غير كافية. احذف بعض التنزيلات أو وفّر مساحة على الجهاز ثم أعد المحاولة.';
    if (error?.name === 'TypeError')
        return 'تعذّر الاتصال. تأكد من الإنترنت ثم أعد المحاولة؛ التنزيلات المكتملة محفوظة.';
    return error?.message || 'تعذّر تنزيل الصوت. أعد المحاولة عند توفر الإنترنت.';
}
// Only a complete, catalog-matching file is committed. No partial download is playable.
// The download service verifies bytes before committing through its repository.
export class AudioDownloadService {
    constructor(audioRepository, fetcher = (...args) => globalThis.fetch(...args)) {
        this.audioRepository = audioRepository;
        this.fetcher = fetcher;
    }
    async download(readerId, recording, { signal, onProgress = () => {} } = {}) {
        if (!recording || !Number.isInteger(recording.bytes) || recording.bytes <= 0 || !/^[a-f0-9]{64}$/.test(recording.sha256))
            throw Error('توثيق التسجيل غير متاح. أعد تحميل التطبيق.');
        signal?.throwIfAborted();
        const response = await this.fetcher(recording.url, {
            signal, cache: 'no-store', credentials: 'same-origin'
        });
        if (!response.ok)
            throw Error('تعذّر تنزيل التسجيل من الخادم. أعد المحاولة.');
        const chunks = [];
        let received = 0;
        if (response.body?.getReader) {
            const reader = response.body.getReader();
            try {
                while (true) {
                    signal?.throwIfAborted();
                    const { value, done } = await reader.read();
                    if (done)
                        break;
                    received += value.byteLength;
                    if (received > recording.bytes)
                        throw Error('الملف لا يطابق التسجيل الموثّق؛ لم يُحفظ.');
                    chunks.push(value);
                    onProgress(received, recording.bytes);
                }
            }
            catch (error) {
                await reader.cancel().catch(() => {
                });
                throw error;
            }
            finally {
                reader.releaseLock();
            }
        }
        else {
            const data = new Uint8Array(await response.arrayBuffer());
            received = data.byteLength;
            chunks.push(data);
            onProgress(received, recording.bytes);
        }
        signal?.throwIfAborted();
        if (received !== recording.bytes)
            throw Error('لم يكتمل تنزيل التسجيل؛ أعد المحاولة.');
        const file = new Blob(chunks, {
            type: 'audio/mpeg'
        });
        const data = new Uint8Array(await file.arrayBuffer());
        const digest = globalThis.crypto?.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', data)) : sha256(data);
        const hash = [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
        if (hash !== recording.sha256)
            throw Error('الملف لا يطابق التسجيل الموثّق؛ لم يُحفظ.');
        signal?.throwIfAborted();
        return this.audioRepository.downloadPut({
            key: downloadKey(readerId, recording.id), readerId, id: recording.id, sha256: hash, bytes: received, file, downloadedAt: Date.now()
        });
    }
    matches(row, recording) {
        return matchingDownload(row, recording);
    }
    errorMessage(error) {
        return downloadError(error);
    }
}
