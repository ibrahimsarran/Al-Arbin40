// Keeps native range gestures independent of playback updates and delayed metadata.
export class SeekControl {
    constructor({ audio, range, clock, durationHint = () => 0, onError = () => {
    } }) {
        Object.assign(this, {
            audio, range, clock, durationHint, onError
        });
        this.dragging = false;
        this.draft = null;
        this.pending = null;
        this.applied = null;
        this.listeners = [];
        this.listen(range, 'pointerdown', () => {
            this.dragging = true;
            this.draft = null;
        });
        this.listen(range, 'input', () => {
            const value = this.ratio();
            if (this.dragging) {
                this.draft = value;
                this.paint();
            }
            else
                this.commit(value);
        });
        this.listen(range, 'change', () => {
            if (this.dragging) {
                if (this.draft === null)
                    this.draft = this.ratio();
                this.finish();
            }
            else if (this.pending !== this.ratio())
                this.commit(this.ratio());
        });
        this.listen(range.ownerDocument, 'pointerup', () => this.finish());
        this.listen(range, 'pointercancel', () => {
            this.dragging = false;
            this.draft = null;
            this.paint();
        });
        this.listen(range, 'blur', () => this.finish());
        for (const event of ['loadedmetadata', 'durationchange', 'canplay'])
            this.listen(audio, event, () => {
                this.apply();
                this.paint();
            });
        for (const event of ['timeupdate', 'seeked'])
            this.listen(audio, event, () => {
                if (this.pending !== null && this.applied !== null && !audio.seeking && Math.abs(audio.currentTime - this.applied) < .35) {
                    this.pending = null;
                    this.applied = null;
                }
                this.paint();
            });
        this.reset();
    }
    listen(target, event, handler) {
        target.addEventListener(event, handler);
        this.listeners.push({
            target, event, handler
        });
    }
    actualDuration() {
        return this.audio.readyState >= 1 && Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 0;
    }
    duration() {
        return this.actualDuration() || Number(this.durationHint()) || 0;
    }
    ratio() {
        return Math.max(0, Math.min(1, Number(this.range.value) / Number(this.range.max || 1000)));
    }
    stamp(t) {
        t = Math.max(0, Number(t) || 0);
        return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    }
    paint() {
        const d = this.duration(), preview = this.draft ?? this.pending, t = preview === null ? this.audio.currentTime || 0 : preview * d;
        if (!this.dragging && preview === null)
            this.range.value = d ? t / d * Number(this.range.max || 1000) : 0;
        this.clock.textContent = this.stamp(t) + ' / ' + this.stamp(d);
        this.range.setAttribute('aria-valuetext', this.stamp(t) + ' من ' + this.stamp(d));
        this.range.disabled = !this.audio.getAttribute('src');
    }
    apply() {
        const d = this.actualDuration();
        if (this.pending === null || !d)
            return;
        const target = this.pending * d;
        if (this.applied !== null && Math.abs(this.applied - target) < .001)
            return;
        try {
            this.audio.currentTime = target;
            this.applied = target;
        }
        catch {
            this.applied = null;
            this.onError();
        }
        this.paint();
    }
    commit(value) {
        this.pending = value;
        this.applied = null;
        this.draft = null;
        this.apply();
        this.paint();
    }
    finish() {
        if (!this.dragging)
            return;
        const value = this.draft;
        this.dragging = false;
        this.draft = null;
        if (value !== null)
            this.commit(value);
        else
            this.paint();
    }
    reset() {
        this.dragging = false;
        this.draft = null;
        this.pending = null;
        this.applied = null;
        this.range.value = 0;
        this.paint();
    }
    seekTo(seconds) {
        const d = this.duration();
        if (d)
            this.commit(Math.max(0, Math.min(1, seconds / d)));
    }
    destroy() {
        for (const { target, event, handler } of this.listeners)
            target.removeEventListener(event, handler);
        this.listeners = [];
    }
}
