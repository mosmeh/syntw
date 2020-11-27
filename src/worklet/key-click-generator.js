import { LinearEnvelope } from './envelope';

export class KeyClickGenerator {
    constructor(volume) {
        this._volume = 20 * volume;
        this._envelope = new LinearEnvelope(0.001, 0.003, 0, 0.01);
        this._envelope.noteOn();
        this._y1 = 0;
    }

    process() {
        const CUTOFF = 0.05 * (44100 / sampleRate);
        const x = (2 * Math.random() - 1) * this._envelope.process();
        const y = x * CUTOFF + this._y1 * (1 - CUTOFF);
        this._y1 = y;
        return this._volume * y;
    }
}
