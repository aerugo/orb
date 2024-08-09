import * as THREE from 'three';
import * as Tone from 'tone';
let synth1, synth2, synth3, pattern1, pattern2, pattern3;

// Filters

export const reverb = new Tone.Reverb({
    decay: 10,
    wet: 0.6
}).toDestination();

export const delay = new Tone.FeedbackDelay({
    delayTime: "4n",
    feedback: 0.5,
    wet: 0.4
}).connect(reverb);

export const autoFilter = new Tone.AutoFilter({
    frequency: "16n",
    baseFrequency: 50,
    octaves: 6,
    type: "sine"
}).connect(delay);

export const spaceFilter = new Tone.Filter({
    type: "bandpass",
    frequency: 200,
    Q: 2
});

const chorus = new Tone.Chorus({
    frequency: 0.1,
    delayTime: 5,
    depth: 0.7,
    wet: 0.5
}).toDestination();

export const distortion = new Tone.Distortion(0.8).toDestination();

export const lowPass = new Tone.Filter(800, "lowpass").toDestination();

// Synthesizers

export const shootSynth = new Tone.Synth({
    oscillator: {
        type: "sine"
    },
    envelope: {
        attack: 0.01,
        decay: 0.3,
        sustain: 0.1,
        release: 0.5
    }
}).connect(reverb);

export const explosionSynth = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 10,
    oscillator: {
        type: "sine"
    },
    envelope: {
        attack: 0.001,
        decay: 0.4,
        sustain: 0.01,
        release: 1.4,
        attackCurve: "exponential"
    }
}).connect(reverb, distortion, lowPass);

const spaceNoise = new Tone.NoiseSynth({
    noise: {
        type: "brown",
        playbackRate: 0.1
    },
    envelope: {
        attack: 2,
        decay: 1,
        sustain: 0.8,
        release: 3
    },
    volume: -40
}).connect(reverb, spaceFilter, chorus)

const spaceDrone = new Tone.FMSynth({
    harmonicity: 0.5,
    modulationIndex: 3,
    oscillator: {
        type: "sine"
    },
    envelope: {
        attack: 4,
        decay: 2,
        sustain: 0.8,
        release: 10
    },
    modulation: {
        type: "square"
    },
    modulationEnvelope: {
        attack: 8,
        decay: 4,
        sustain: 0.5,
        release: 15
    },
    volume: -25
}).connect(reverb);

const spacePad = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 3,
    oscillator: {
        type: "sine"
    },
    envelope: {
        attack: 3,
        decay: 5,
        sustain: 0.8,
        release: 8
    },
    modulation: {
        type: "square"
    },
    modulationEnvelope: {
        attack: 2,
        decay: 3,
        sustain: 0.8,
        release: 10
    },
    volume: -30
}).connect(reverb);

const spaceLfo = new Tone.LFO({
    frequency: 0.03,
    min: 100,
    max: 800
}).connect(spaceFilter.frequency);

const droneLfo = new Tone.LFO({
    frequency: 0.02,
    min: 50,
    max: 100
}).connect(spaceDrone.frequency);

export function updateChord(interpolationFactor) {
    // Define a set of drone notes
    const droneNotes = [
        ["C2", "G2", "E3"],
        ["F2", "C3", "A3"],
        ["G2", "D3", "B3"],
        ["A2", "E3", "C4"]
    ];

    // Determine which drone set to use based on interpolationFactor
    const droneSetIndex = Math.floor(interpolationFactor * droneNotes.length) % droneNotes.length;
    const targetDroneSet = droneNotes[droneSetIndex];

    // Interpolate between current drone set and target drone set
    const interpolatedDrones = targetDroneSet.map((note, index) => {
        const freq1 = Tone.Frequency(droneNotes[0][index]).toFrequency();
        const freq2 = Tone.Frequency(note).toFrequency();
        const interpolatedFreq = freq1 + (freq2 - freq1) * (interpolationFactor * droneNotes.length % 1);
        return Tone.Frequency(interpolatedFreq).toNote();
    });

    // Assign drones to different synths
    synth1.frequency.rampTo(interpolatedDrones[0], 1);
    synth2.frequency.rampTo(interpolatedDrones[1], 1);
    synth3.frequency.rampTo(interpolatedDrones[2], 1);

    // Update effects based on interpolation factor
    autoFilter.baseFrequency = 50 + interpolationFactor * 200;
    delay.delayTime.value = 0.2 + interpolationFactor * 0.3;
    reverb.decay = 5 + interpolationFactor * 5;
    
    // Adjust synth parameters based on interpolation factor
    const chordSynthSettings = {
        envelope: {
            attack: 0.5 + interpolationFactor * 0.5,
            decay: 0.5 + interpolationFactor * 0.5,
            sustain: 1,
            release: 5 - interpolationFactor * 3
        }
    };
    
    synth1.set(chordSynthSettings);
    synth2.set(chordSynthSettings);
    synth3.set(chordSynthSettings);

    // Occasionally add microtonal adjustments
    if (Math.random() < 0.05) {
        const microtonalAdjustment = (Math.random() - 0.5) * 10; // +/- 5 cents
        synth1.detune.rampTo(microtonalAdjustment, 1);
        synth2.detune.rampTo(-microtonalAdjustment, 1);
        synth3.detune.rampTo(microtonalAdjustment * 0.5, 1);
    }

    // Adjust tempo based on interpolationFactor
    // Slower when blob (interpolationFactor close to 0), faster when sphere (interpolationFactor close to 1)
    const minBPM = 55;  // Slowest tempo
    const maxBPM = 65; // Fastest tempo
    const newBPM = minBPM + (maxBPM - minBPM) * interpolationFactor;
    Tone.Transport.bpm.rampTo(newBPM, 2); // Ramp to new BPM over 2 seconds for smooth transition
}

export function updateVolume(distanceFromCenter) {
    const maxDistance = 3; // Adjust this value based on your scene size
    const minVolume = -30; // in decibels
    const maxVolume = 0; // in decibels

    // Calculate volume based on distance (closer = louder)
    const volume = THREE.MathUtils.mapLinear(
        distanceFromCenter,
        0,
        maxDistance,
        maxVolume,
        minVolume
    );

    // Apply volume to all synths
    synth1.volume.rampTo(volume, 0.1);
    synth2.volume.rampTo(volume, 0.1);
    synth3.volume.rampTo(volume, 0.1);
    // Wind noise volume remains constant
}

export async function initAudio() {
    try {
        await Tone.start();
        console.log('Audio context started');

        autoFilter.start();
        spaceLfo.start();
        droneLfo.start();
        spaceNoise.triggerAttack();
        spaceDrone.triggerAttack("C1");
        spacePad.triggerAttack(["C2", "G2", "C3"], Tone.now(), 0.1);

        console.log('All audio components initialized');
    } catch (error) {
        console.error('Error initializing audio:', error);
    }

    // Slowly modulate the pad notes for an evolving texture
    setInterval(() => {
        spacePad.triggerRelease(["C2", "G2", "C3"]);
        setTimeout(() => {
            const notes = ["C2", "D#2", "G2", "A#2", "C3", "D#3"].sort(() => Math.random() - 0.5).slice(0, 3);
            spacePad.triggerAttack(notes, Tone.now(), 0.1);
        }, 2000);
    }, 15000);


    // Create multiple synths for layered drones
    const synthSettings = {
        oscillator: {
            type: "fatsawtooth",
            count: 3,
            spread: 30
        },
        envelope: {
            attack: 0.5,
            decay: 0.5,
            sustain: 1,
            release: 5
        }
    };

    if (!synth1) synth1 = new Tone.Synth(synthSettings).connect(autoFilter);
    if (!synth2) synth2 = new Tone.Synth(synthSettings).connect(autoFilter);
    if (!synth3) synth3 = new Tone.Synth(synthSettings).connect(autoFilter);

    // Create drone patterns
    if (!pattern1) {
        pattern1 = new Tone.Loop((time) => {
            synth1.triggerAttackRelease("C2", "2n", time);
        }, "2n");
    }

    if (!pattern2) {
        pattern2 = new Tone.Loop((time) => {
            synth2.triggerAttackRelease("G2", "4n", time);
        }, "4n");
    }

    if (!pattern3) {
        pattern3 = new Tone.Loop((time) => {
            synth3.triggerAttackRelease("E2", "8n", time);
        }, "8n");
    }

    // Set up drone patterns
    Tone.Transport.timeSignature = [4, 4];
    Tone.Transport.bpm.value = 60;

    pattern1.start(0);
    pattern2.start("8n");
    pattern3.start("8n.");

    // Add subtle modulations
    Tone.Transport.scheduleRepeat((time) => {
        if (Math.random() < 0.1) {
            Tone.Transport.bpm.value = Math.random() * 10 + 55; // Random BPM between 55 and 65
        }
    }, "4m");

    // Ensure Transport is started
    if (Tone.Transport.state !== "started") {
        Tone.Transport.start();
        console.log('Tone.Transport started');
    }
}
