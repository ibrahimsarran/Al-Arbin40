import { SeekControl } from './seek-control.mjs';
// Owns one media session and its seek control. UI rendering belongs to ReaderController.
export class AudioPlayer {
    constructor(audio, { range, clock, onError = () => {
    } }) {
        this.audio = audio;
        this.activeAudio = null;
        this.activeRecording = null;
        this.audioTicket = 0;
        this.repeat = false;
        this.seekControl = new SeekControl({
            audio, range, clock, durationHint: () => this.activeRecording?.duration || 0, onError
        });
    }
    async play(id, recording, { startAt = 0, shouldPlay = true, speed = 1 } = {}) {
        const ticket = ++this.audioTicket;
        this.audio.pause();
        this.activeAudio = id;
        this.activeRecording = recording;
        this.audio.src = recording.url;
        this.audio.loop = this.repeat;
        this.audio.load();
        this.seekControl.reset();
        this.setSpeed(speed);
        try {
            if (startAt > 0)
                this.seekControl.seekTo(startAt);
            if (shouldPlay)
                await this.audio.play();
            return ticket === this.audioTicket;
        }
        catch (error) {
            if (ticket !== this.audioTicket || error.name === 'AbortError')
                return false;
            throw error;
        }
    }
    setSpeed(speed) {
        this.audio.defaultPlaybackRate = this.audio.playbackRate = Number(speed);
    }
    setRepeat(repeat) {
        this.repeat = Boolean(repeat);
        this.audio.loop = this.repeat;
    }
    seekTo(seconds) {
        this.seekControl.seekTo(seconds);
    }
    clear() {
        ++this.audioTicket;
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.seekControl.reset();
        this.activeAudio = null;
        this.activeRecording = null;
    }
    destroy() {
        this.clear();
        this.seekControl.destroy();
    }
}
