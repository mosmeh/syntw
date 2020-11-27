import {
    NUM_DRAWBARS,
    LOWEST_TW_NOTE,
    HIGHEST_TW_NOTE,
    HARM_OFFSETS,
} from './constants';
import { LinearEnvelope } from './envelope';
import { ToneGenerator } from './tone-generator';
import { KeyClickGenerator } from './key-click-generator';
import { RotarySpeaker } from './rotary-speaker';

class Voice {
    constructor(toneGen, note, keyClickVolume) {
        this.note = note;
        this.down = true;

        this._toneGen = toneGen;
        this._tonewheels = new Array(NUM_DRAWBARS);
        for (let i = 0; i < NUM_DRAWBARS; ++i) {
            this._tonewheels[i] =
                foldback(note + HARM_OFFSETS[i]) - LOWEST_TW_NOTE;
        }

        this._envelope = new LinearEnvelope(0.005, 0, 1, 0.01);
        this._envelope.noteOn();

        this._keyClickGen = new KeyClickGenerator(keyClickVolume);
    }

    noteOff() {
        this._envelope.noteOff();
    }

    get active() {
        return this._envelope.active;
    }

    process() {
        let x = this._toneGen.generate(this._tonewheels);
        if (x !== 0) {
            x += this._keyClickGen.process();
        }
        return this._envelope.process() * x;
    }
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

class Processor extends AudioWorkletProcessor {
    constructor() {
        super();

        this._voices = [];
        this._sustain = false;
        this._volume = calcVolume(0);
        this._keyClickVolume = 0.5;
        this._toneGen = new ToneGenerator();
        this._rotarySpeaker = new RotarySpeaker();

        this.port.onmessage = (msg) => {
            const { data } = msg;
            switch (data.type) {
                case 'drawbars':
                    this._toneGen.drawbars = data.drawbars;
                    break;
                case 'percussion': {
                    const { on, volume, decay, harmonic } = data;
                    this._toneGen.percussionOn = on;
                    this._toneGen.percussionVolume = volume;
                    this._toneGen.percussionDecay = decay;
                    this._toneGen.percussionHarmonic = harmonic;
                    break;
                }
                case 'keyClick':
                    this._keyClickVolume = data.volume;
                    break;
                case 'rotarySpeaker': {
                    const { on, speed } = data;
                    this._rotarySpeaker.on = on;
                    this._rotarySpeaker.speed = speed;
                    break;
                }
                case 'noteOn': {
                    const { note } = data;
                    if (36 <= note && note <= 96) {
                        if (this._voices.length === 0) {
                            this._toneGen.triggerPercussion();
                        }

                        const newVoice = new Voice(
                            this._toneGen,
                            note,
                            this._keyClickVolume
                        );
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
                }
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

            this._toneGen.process();
        }

        return true;
    }
}

function calcVolume(numVoices) {
    return Math.pow(10, (-18 - 0.2 * numVoices) / 20);
}

registerProcessor('main', Processor);
