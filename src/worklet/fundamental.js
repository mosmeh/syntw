import { TAU } from './constants';

class Allpass {
    constructor() {
        this.eta = 0;
        this._x1 = this._y1 = 0;
    }

    process(x) {
        const y = this._x1 + this.eta * (x - this._y1);
        this._x1 = x;
        this._y1 = y;
        return y;
    }
}

export class Delay {
    constructor(maxLength) {
        let length = 1;
        while (length < maxLength) {
            length *= 2;
        }

        this._buf = new Float32Array(length);
        this._mask = length - 1;
        this._readPtr = this._writePtr = 0;
        this._allpass = new Allpass();
        this._out = 0;
    }

    set length(value) {
        let readPos = this._writePtr - value + 1;
        while (readPos < 0) {
            readPos += this._buf.length;
        }

        this._readPtr = readPos & this._mask;

        let alpha = 1 + this._readPtr - readPos;
        if (alpha < 0.5) {
            this._readPtr = (this._readPtr + 1) & this._mask;
            alpha += 1;
        }

        this._allpass.eta = (1 - alpha) / (1 + alpha);
    }

    input(x) {
        this._buf[this._writePtr] = x;
        this._readPtr = (this._readPtr + 1) & this._mask;
        this._writePtr = (this._writePtr + 1) & this._mask;
        this._out = this._allpass.process(this._buf[this._readPtr]);
    }

    output() {
        return this._out;
    }
}

export class LowpassFilter {
    constructor() {
        this._freq = 440;
        this._q = 1;
        this._b = new Float32Array(3);
        this._a = new Float32Array(3);
        this._x1 = this._x2 = this._y1 = this._y2 = 0;
    }

    set freq(value) {
        this._freq = value;
        this._calcCoefs();
    }

    set q(value) {
        this._q = value;
        this._calcCoefs();
    }

    process(x) {
        const y =
            (this._b[0] * x +
                this._b[1] * this._x1 +
                this._b[2] * this._x2 -
                this._a[1] * this._y1 -
                this._a[2] * this._y2) /
            this._a[0];
        this._x2 = this._x1;
        this._x1 = x;
        this._y2 = this._y1;
        this._y1 = y;
        return y;
    }

    _calcCoefs() {
        const omega = (TAU * this._freq) / sampleRate;
        const alpha = Math.sin(omega) / (2 * Math.pow(10, this._q / 20));
        this._b[0] = (1 - Math.cos(omega)) / 2;
        this._b[1] = this._b[0] * 2;
        this._b[2] = this._b[0];
        this._a[0] = 1 + alpha;
        this._a[1] = -2 * Math.cos(omega);
        this._a[2] = 1 - alpha;
    }
}
