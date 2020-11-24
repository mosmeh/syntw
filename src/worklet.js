const TAU = 2 * Math.PI;
const LOWEST_TW_NOTE = 36;
const HIGHEST_TW_NOTE = 114;
const NUM_TONEWHEELS = HIGHEST_TW_NOTE - LOWEST_TW_NOTE + 1; // 79
const NUM_DRAWBARS = 9;
const HARM_OFFSETS = [-12, 7, 0, 12, 19, 24, 28, 31, 36];

class ToneGenerator {
    constructor() {
        this._phases = new Float32Array(NUM_TONEWHEELS);
        this._deltas = new Float32Array(NUM_TONEWHEELS);
        for (let i = 0; i < NUM_TONEWHEELS; ++i) {
            this._phases[i] = Math.random();
            this._deltas[i] = mtof(i + LOWEST_TW_NOTE) / sampleRate;
        }

        this._harmVolumes = new Float32Array(NUM_DRAWBARS).fill(1);

        this._sine = new Float32Array(16384);
        for (let i = 0; i < this._sine.length; ++i) {
            this._sine[i] = Math.sin((TAU * i) / this._sine.length);
        }
    }

    set drawbars(value) {
        for (let i = 0; i < NUM_DRAWBARS; ++i) {
            this._harmVolumes[i] =
                value[i] === 0 ? 0 : Math.pow(10, (3 * (value[i] - 8)) / 20);
        }
    }

    generate(tonewheels) {
        let sum = 0;
        for (let i = 0; i < NUM_DRAWBARS; ++i) {
            if (this._harmVolumes[i] > 0) {
                const idx =
                    (this._phases[tonewheels[i]] * this._sine.length) &
                    (this._sine.length - 1);
                sum += this._harmVolumes[i] * this._sine[idx];
            }
        }

        return sum / NUM_DRAWBARS;
    }

    process() {
        for (let i = 0; i < NUM_TONEWHEELS; ++i) {
            this._phases[i] += this._deltas[i];
            if (this._phases[i] >= 1) {
                this._phases[i] -= 1;
            }
        }
    }
}

class Envelope {
    constructor(attack, decay, sustain, release) {
        this._value = 0;
        this._state = 'attack';
        this._attackRate = 1 / (attack * sampleRate);
        this._decayRate = (1 - sustain) / (decay * sampleRate);
        this._sustain = sustain;
        this._release = release;
        this._releaseRate = sustain / (release * sampleRate);
    }

    noteOff() {
        switch (this._state) {
            case 'attack':
            case 'decay':
            case 'sustain':
                this._state = 'release';
                this._releaseRate = this._value / (this._release * sampleRate);
                break;
        }
    }

    get active() {
        return this._state !== 'idle';
    }

    process() {
        switch (this._state) {
            case 'attack':
                this._value += this._attackRate;
                if (this._value >= 1) {
                    this._value = 1;
                    this._state = this._sustain === 1 ? 'sustain' : 'decay';
                }
                break;
            case 'decay':
                if (this._value > this._sustain) {
                    this._value -= this._decayRate;
                    if (this._value <= this._sustain) {
                        this._value = this._sustain;
                        this._state = 'sustain';
                    }
                } else {
                    this._value += this._decayRate;
                    if (this._value >= this._sustain) {
                        this._value = this._sustain;
                        this._state = 'sustain';
                    }
                }
                break;
            case 'release':
                this._value -= this._releaseRate;
                if (this._value <= 0) {
                    this._value = 0;
                    this._state = 'idle';
                }
                break;
        }

        return this._value;
    }
}

class Voice {
    constructor(note, toneGenerator) {
        this.note = note;
        this.down = true;

        this._toneGen = toneGenerator;
        this._tonewheels = new Array(NUM_DRAWBARS);
        for (let i = 0; i < NUM_DRAWBARS; ++i) {
            this._tonewheels[i] =
                foldback(note + HARM_OFFSETS[i]) - LOWEST_TW_NOTE;
        }

        this._envelope = new Envelope(0.005, 0, 1, 0.01);
    }

    noteOff() {
        this._envelope.noteOff();
    }

    get active() {
        return this._envelope.active;
    }

    process() {
        return (
            this._envelope.process() * this._toneGen.generate(this._tonewheels)
        );
    }
}

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

class Delay {
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

class LowpassFilter {
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

// https://ccrma.stanford.edu/~juanig/codexamp/ckleslie.html

const SSPEEDMTS = 345.12;

class RotarySpeaker {
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

class Processor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._voices = [];
        this._sustain = false;
        this._volume = calcVolume(0);
        this._toneGenerator = new ToneGenerator();
        this._rotarySpeaker = new RotarySpeaker();

        this.port.onmessage = (msg) => {
            const { data } = msg;
            switch (data.type) {
                case 'drawbars':
                    this._toneGenerator.drawbars = data.drawbars;
                    break;
                case 'rotarySpeaker':
                    this._rotarySpeaker.on = data.on;
                    this._rotarySpeaker.speed = data.speed;
                    break;
                case 'noteOn':
                    const { note } = data;
                    if (36 <= note && note <= 96) {
                        const newVoice = new Voice(note, this._toneGenerator);
                        const i = this._voices.findIndex(
                            (voice) => voice.note === note
                        );
                        if (i !== -1) {
                            this._voices[i] = newVoice;
                        } else {
                            this._voices.push(newVoice);
                            this._volume = calcVolume(this._voices.length);
                        }
                    }
                    break;
                case 'noteOff':
                    this._voices.forEach((voice) => {
                        if (voice.note === data.note && voice.down) {
                            voice.down = false;
                            if (!this._sustain) {
                                voice.noteOff();
                            }
                        }
                    });
                    break;
                case 'sustain':
                    this._sustain = data.down;
                    if (!data.down) {
                        this._voices.forEach((voice) => {
                            if (!voice.down) {
                                voice.noteOff();
                            }
                        });
                    }
                    break;
            }
        };
    }

    process(_, outputs) {
        this._voices = this._voices.filter((voice) => voice.active);
        this._volume = calcVolume(this._voices.length);

        for (let i = 0; i < outputs[0][0].length; ++i) {
            const x =
                this._volume *
                this._voices.reduce((sum, voice) => sum + voice.process(), 0);

            const y = this._rotarySpeaker.process(x);
            outputs[0][0][i] = y[0];
            outputs[0][1][i] = y[1];
            outputs[1][0][i] = y[2];
            outputs[1][1][i] = y[3];

            this._toneGenerator.process();
        }

        return true;
    }
}

registerProcessor('main', Processor);

function mtof(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

function foldback(note) {
    while (note < LOWEST_TW_NOTE) {
        note += 12;
    }
    while (note > HIGHEST_TW_NOTE) {
        note -= 12;
    }
    return note;
}

function calcVolume(numVoices) {
    return Math.pow(10, (-0.2 * numVoices) / 20);
}
