export class LinearEnvelope {
    constructor(attack, decay, sustain, release) {
        this._value = 0;
        this._state = 'idle';
        this._attackRate = 1 / (attack * sampleRate);
        this._decayRate = (1 - sustain) / (decay * sampleRate);
        this._sustain = sustain;
        this._release = release;
        this._releaseRate = sustain / (release * sampleRate);
    }

    set decay(value) {
        this._decayRate = (1 - this._sustain) / (value * sampleRate);
    }

    noteOn() {
        this._state = 'attack';
        this._value = 0;
    }

    noteOff() {
        switch (this._state) {
            case 'idle':
            case 'attack':
            case 'decay':
            case 'sustain':
                this._state = 'release';
                this._releaseRate = this._value / (this._release * sampleRate);
                break;
        }
    }

    get value() {
        return this._value;
    }

    get active() {
        return this._state !== 'finished';
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
                    this._state = 'finished';
                }
                break;
        }

        return this._value;
    }
}

const EPS = 1e-4;

export class ExponentialEnvelope {
    constructor(attack, decay, sustain, release) {
        this._value = 0;
        this._state = 'idle';
        this._attack = attack * sampleRate;
        this._decay = decay * sampleRate;
        this._sustain = sustain;
        this._release = release * sampleRate;
        this._attackRate = calcExpRate(0, 1, this._attack);
        this._decayRate = calcExpRate(1, sustain, this._decay);
        this._samples = 0;
    }

    set decay(value) {
        this._decay = value * sampleRate;
        this._decayRate = calcExpRate(1, this._sustain, this._decay);
    }

    noteOn() {
        this._state = 'attack';
        this._value = EPS;
    }

    noteOff() {
        switch (this._state) {
            case 'idle':
            case 'attack':
            case 'decay':
            case 'sustain':
                this._state = 'release';
                this._releaseRate = calcExpRate(this._value, 0, this._release);
                this._samples = 0;
                break;
        }
    }

    get value() {
        return this._value;
    }

    get active() {
        return this._state !== 'finished';
    }

    process() {
        switch (this._state) {
            case 'attack':
                this._value *= this._attackRate;
                if (this._samples++ >= this._attack) {
                    this._value = 1;
                    this._state = this._sustain === 1 ? 'sustain' : 'decay';
                    this._samples = 0;
                }
                break;
            case 'decay':
                this._value *= this._decayRate;
                if (this._samples++ >= this._decay) {
                    this._value = this._sustain;
                    this._state = 'sustain';
                    this._samples = 0;
                }
                break;
            case 'release':
                this._value *= this._releaseRate;
                if (this._samples++ >= this._release) {
                    this._value = 0;
                    this._state = 'finished';
                }
                break;
        }

        return this._value;
    }
}

function calcExpRate(start, end, samples) {
    return Math.exp(
        (Math.log(Math.max(EPS, end)) - Math.log(Math.max(EPS, start))) /
            samples
    );
}
