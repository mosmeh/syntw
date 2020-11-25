import * as Tone from 'tone';
import worklet from '-!url-loader?limit=false!./worklet';

export class Synth {
    async setup() {
        const context = Tone.getContext();

        await context.addAudioWorkletModule(worklet, 'main');
        const workletNode = context.createAudioWorkletNode('main', {
            numberOfInputs: 0,
            numberOfOutputs: 2,
            outputChannelCount: [2, 2],
        });
        this._port = workletNode.port;

        const rotaryReverb = new Tone.Reverb().set({
            wet: 0.3,
            decay: 0.5,
            preDelay: 0.01,
        });

        const masterReverb = new Tone.Reverb().set({
            wet: 0.5,
            decay: 0.5,
            preDelay: 0.01,
        });
        this._gain = new Tone.Gain(1);

        Tone.connect(workletNode, masterReverb, 0);
        Tone.connect(workletNode, rotaryReverb, 1);
        rotaryReverb.chain(
            new Tone.Gain(0.5),
            masterReverb,
            this._gain,
            Tone.Destination
        );
    }

    set volume(value) {
        this._gain.gain.value = value;
    }

    set drawbars(value) {
        this._port.postMessage({
            type: 'drawbars',
            drawbars: value,
        });
    }

    set keyClickVolume(volume) {
        this._port.postMessage({
            type: 'keyClick',
            volume,
        });
    }

    setPercussionState({ on, volume, decay, harmonic }) {
        this._port.postMessage({
            type: 'percussion',
            on,
            volume,
            decay,
            harmonic,
        });
    }

    setRotaryState({ on, speed }) {
        this._port.postMessage({
            type: 'rotarySpeaker',
            on,
            speed,
        });
    }

    noteOn(note) {
        this._port.postMessage({
            type: 'noteOn',
            note,
        });
    }

    noteOff(note) {
        this._port.postMessage({
            type: 'noteOff',
            note,
        });
    }

    sustain(down) {
        this._port.postMessage({
            type: 'sustain',
            down,
        });
    }
}
