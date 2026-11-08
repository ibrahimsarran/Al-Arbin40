export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
export const ar = n => Number(n).toLocaleString('ar-SA', {
    useGrouping: false
});
export const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
export const iconPaths = {
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', play: '<path d="m9 5 11 7-11 7Z"/>', bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>', note: '<path d="m16 3 5 5-11 11-7 2 2-7Z"/><path d="m14 5 5 5"/>', focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--paper)"/><circle cx="15" cy="17" r="3" fill="var(--paper)"/>', arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>', book: '<path d="M12 5v16M3 3c4 0 7 0 9 2 2-2 5-2 9-2v16c-4 0-7 0-9 2-2-2-5-2-9-2Z"/>'
};
export const glyph = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
export const megabytes = bytes => (bytes / 1024 / 1024).toLocaleString('ar-SA', {
    maximumFractionDigits: 1
}) + ' MB';
export function time(t) {
    if (!Number.isFinite(t))
        return '0:00';
    return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
}
