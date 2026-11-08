// Timing data is bound to the exact displayed text and the exact bundled recording.
export function buildTimingIndex(hadiths, data, catalog) {
    const index = new Map();
    if (data?.version !== 1 || !Array.isArray(data.hadiths))
        return index;
    for (const item of data.hadiths) {
        const h = hadiths.find(h => h.id === item.id), r = catalog.recordings.find(r => r.id === item.id);
        if (!h || !r || item.sourceText !== h.text || item.audioSha256 !== r.sha256 || !Array.isArray(item.segments))
            continue;
        const sourceWords = h.words || h.text.trim().split(/\s+/u);
        let end = -1;
        const segments = [];
        for (const s of item.segments) {
            if (!Number.isInteger(s.index) || s.index < 0 || s.index >= sourceWords.length || s.text !== sourceWords[s.index] || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.end > r.duration + .02 || s.start < end - .001)
                continue;
            segments.push({ ...s });
            end = s.end;
        }
        if (segments.length)
            index.set(item.id, { audioSha256: r.sha256, segments, byWord: new Map(segments.map(s => [s.index, s])) });
    }
    return index;
}
export function timedWord(index, id, word, recording) { const set = index.get(id); return set && set.audioSha256 === recording?.sha256 ? set.byWord.get(word) || null : null; }
export function wordAt(index, id, time, recording) {
    const set = index.get(id);
    if (!set || set.audioSha256 !== recording?.sha256 || !Number.isFinite(time))
        return null;
    let lo = 0, hi = set.segments.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, s = set.segments[mid];
        if (time < s.start)
            hi = mid - 1;
        else if (time >= s.end)
            lo = mid + 1;
        else
            return s;
    }
    return null;
}
