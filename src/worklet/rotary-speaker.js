import { TAU } from './constants';
import { Delay, LowpassFilter } from './fundamental';

// https://ccrma.stanford.edu/~juanig/codexamp/ckleslie.html

const SSPEEDMTS = 345.12;

export class RotarySpeaker {
    constructor() {
        this.on = true;
        this.speed = 2;

        this._hornRadius = 0.18;
        this._baffleRadius = 0.1905;
        this._cabinetLen = 0.71;
        this._cabinetWid = 0.52;

        this._hornAngle = this._baffleAngle = 0;

        let maxDopDelay = TAU * this._hornRadius * this._hornAngVel;
        maxDopDelay *= sampleRate / SSPEEDMTS;

        let maxReflDelay =
            Math.max(this._cabinetLen, 1.5 * this._cabinetWid) +
            this._hornRadius;
        maxReflDelay *= sampleRate / SSPEEDMTS;

        const startDopDelay = (48 * sampleRate) / 44100;
        const startFreqShift = 10;

        this._dshift = new Float32Array(4).fill(startDopDelay);
        this._fshift = new Float32Array(4).fill(startFreqShift * TAU);
        this._dlines = new Array(4);
        this._reflPaths = new Array(4);
        this._filters = new Array(4);

        for (let i = 0; i < 4; ++i) {
            this._dlines[i] = new Delay(maxDopDelay + 2);
            this._reflPaths[i] = new Delay(maxReflDelay + 2);
            this._filters[i] = new LowpassFilter();
        }
    }

    set speed(value) {
        this._hornAngVel = value;
        this._baffleAngVel = 0.98 * value;
    }

    process(x) {
        if (!this.on) {
            return [x, x, 0, 0];
        }

        this._advanceParams();

        x /= 2;
        for (let i = 0; i < 4; ++i) {
            this._dlines[i].input(x);
            this._reflPaths[i].input(this._dlines[i].output());
        }

        return [
            this._filters[0].process(x) + this._filters[2].process(x),
            this._filters[1].process(x) + this._filters[3].process(x),
            this._reflPaths[0].output() + this._reflPaths[2].output(),
            this._reflPaths[1].output() + this._reflPaths[3].output(),
        ];
    }

    _advanceParams() {
        this._hornAngle += (TAU * this._hornAngVel) / sampleRate;
        if (this._hornAngle >= TAU) {
            this._hornAngle -= TAU;
        }

        const xDev = this._hornRadius * Math.cos(this._hornAngle);
        const yDev = this._hornRadius * Math.sin(this._hornAngle);

        const dAmp = (-TAU * this._hornAngVel) / SSPEEDMTS;
        const incr0 = dAmp * xDev;
        const incr1 = dAmp * yDev;

        this._dshift[0] -= incr0;
        this._dshift[1] -= incr1;
        this._dshift[2] += incr0;
        this._dshift[3] += incr1;

        for (let i = 0; i < 4; ++i) {
            this._dlines[i].length = this._dshift[i];
        }

        const m2samp = sampleRate / SSPEEDMTS;
        this._reflPaths[0].length = (this._cabinetWid / 2 + yDev) * m2samp;
        this._reflPaths[1].length = (this._cabinetLen - xDev) * m2samp;
        this._reflPaths[2].length = (1.5 * this._cabinetWid - yDev) * m2samp;
        this._reflPaths[3].length = (this._cabinetLen + xDev) * m2samp;

        this._baffleAngle += (TAU * this._baffleAngVel) / sampleRate;
        if (this._baffleAngle >= TAU) {
            this._baffleAngle -= TAU;
        }

        const fAmp =
            (-TAU * this._baffleRadius * this._baffleAngVel) / SSPEEDMTS;
        const incra = fAmp * Math.cos(this._baffleAngle);
        const incrb = fAmp * Math.sin(this._baffleAngle);

        this._fshift[0] -= incra;
        this._fshift[1] -= incrb;
        this._fshift[2] += incra;
        this._fshift[3] += incrb;

        for (let i = 0; i < 3; ++i) {
            this._filters[i].freq = this._fshift[i] * 10 + 50 * TAU;
        }
        this._filters[3].freq = this._fshift[3] * 10 + 100 * TAU;
    }
}
