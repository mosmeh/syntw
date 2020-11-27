import {
    TAU,
    NUM_DRAWBARS,
    NUM_TONEWHEELS,
    LOWEST_TW_NOTE,
    DRAWBAR_VOLUME_SOFT,
    DRAWBAR_VOLUME_NORMAL,
    PERC_VOLUME_SOFT,
    PERC_VOLUME_NORMAL,
    PERC_KEYSCALE_FACTOR,
} from './constants';
import { ExponentialEnvelope } from './envelope';

export class ToneGenerator {
    constructor() {
        this._phases = new Float32Array(NUM_TONEWHEELS);
        this._deltas = new Float32Array(NUM_TONEWHEELS);
        for (let i = 0; i < NUM_TONEWHEELS; ++i) {
            this._phases[i] = Math.random();
            this._deltas[i] = mtof(i + LOWEST_TW_NOTE) / sampleRate;
        }

        this._sinTable = new Float32Array(16384);
        for (let i = 0; i < this._sinTable.length; ++i) {
            this._sinTable[i] = Math.sin((TAU * i) / this._sinTable.length);
        }

        this._harmVolumes = new Float32Array(NUM_DRAWBARS).fill(1);

        this._percOn = true;
        this._percVolume = 'soft';
        this._percHarm = 4;
        this._percEnv = new ExponentialEnvelope(0, 0.38, 0, 0);
    }

    set drawbars(value) {
        for (let i = 0; i < NUM_DRAWBARS; ++i) {
            this._harmVolumes[i] =
                value[i] === 0 ? 0 : Math.pow(10, (3 * (value[i] - 8)) / 20);
        }
    }

    set percussionOn(on) {
        if (!this._percOn && on) {
            this.triggerPercussion();
        }
        this._percOn = on;
    }

    set percussionVolume(volume) {
        this._percVolume = volume;
    }

    set percussionDecay(decay) {
        this._percEnv.decay = decay === 'fast' ? 0.38 : 1.087;
    }

    set percussionHarmonic(harm) {
        this._percHarm = harm === 'second' ? 3 : 4;
    }

    triggerPercussion() {
        this._percEnv.noteOn();
    }

    generate(tonewheels) {
        let drawbarGain = DRAWBAR_VOLUME_SOFT;
        let percGain = PERC_VOLUME_SOFT;
        if (this._percOn && this._percVolume === 'normal') {
            drawbarGain = DRAWBAR_VOLUME_NORMAL;
            percGain = PERC_VOLUME_NORMAL;
        }

        let sum = 0;
        const n = this._percOn ? NUM_DRAWBARS - 1 : NUM_DRAWBARS;
        for (let i = 0; i < n; ++i) {
            if (this._harmVolumes[i] > 0) {
                sum +=
                    this._harmVolumes[i] * this._readTonewheel(tonewheels[i]);
            }
        }
        sum *= drawbarGain;

        if (this._percOn && this._percEnv.active) {
            const tw = tonewheels[this._percHarm];
            const keyScaling = (tw - LOWEST_TW_NOTE) / NUM_TONEWHEELS;
            sum +=
                percGain *
                this._percEnv.value *
                (1 - keyScaling * PERC_KEYSCALE_FACTOR) *
                this._readTonewheel(tw);
        }

        return sum;
    }

    process() {
        for (let i = 0; i < NUM_TONEWHEELS; ++i) {
            this._phases[i] += this._deltas[i];
            if (this._phases[i] >= 1) {
                this._phases[i] -= 1;
            }
        }
        this._percEnv.process();
    }

    _readTonewheel(tonewheel) {
        const phase = this._phases[tonewheel];
        const idx =
            (phase * this._sinTable.length) & (this._sinTable.length - 1);
        return this._sinTable[idx];
    }
}

function mtof(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}
