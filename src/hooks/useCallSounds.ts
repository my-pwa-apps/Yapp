import { useRef, useCallback } from 'react';

/**
 * Generates call sounds using the Web Audio API.
 * - Outgoing call: classic "ring-back" tone (repeating double beep)
 * - Incoming call: ringtone pattern (ascending two-tone melody)
 */

type SoundType = 'dialtone' | 'ringtone';

interface SoundState {
  ctx: AudioContext;
  oscillators: OscillatorNode[];
  gains: GainNode[];
  intervalId: ReturnType<typeof setInterval> | null;
}

function createDialtone(ctx: AudioContext): { oscillators: OscillatorNode[]; gains: GainNode[]; intervalId: ReturnType<typeof setInterval> } {
  // North American ring-back tone: 440 Hz + 480 Hz, 2 s on / 4 s off
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.value = 440;
  osc1.connect(masterGain);
  osc1.start();

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.value = 480;
  osc2.connect(masterGain);
  osc2.start();

  // Ramp pattern: 2 seconds on, 4 seconds off
  let on = true;
  const ramp = () => {
    const now = ctx.currentTime;
    if (on) {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(0, now);
      masterGain.gain.linearRampToValueAtTime(0.15, now + 0.05);
      // Hold for 2s then fade out
      masterGain.gain.setValueAtTime(0.15, now + 1.95);
      masterGain.gain.linearRampToValueAtTime(0, now + 2.0);
    }
    on = !on;
  };

  // Start immediately with the "on" phase
  ramp();
  const intervalId = setInterval(ramp, 2000);

  return { oscillators: [osc1, osc2], gains: [masterGain], intervalId };
}

function createRingtone(ctx: AudioContext): { oscillators: OscillatorNode[]; gains: GainNode[]; intervalId: ReturnType<typeof setInterval> } {
  // Pleasant two-tone ringtone: alternating notes with a musical feel
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 660;
  osc.connect(masterGain);
  osc.start();

  // Pattern: short beep at 660Hz, short beep at 880Hz, pause — repeat
  let step = 0;
  const playPattern = () => {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);

    // Ring pattern: beep-beep, beep-beep, pause
    // Two quick beeps per "ring"
    masterGain.gain.setValueAtTime(0, now);

    // First beep
    osc.frequency.setValueAtTime(660, now);
    masterGain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    masterGain.gain.setValueAtTime(0.2, now + 0.15);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.18);

    // Second beep (higher)
    osc.frequency.setValueAtTime(880, now + 0.25);
    masterGain.gain.setValueAtTime(0, now + 0.25);
    masterGain.gain.linearRampToValueAtTime(0.2, now + 0.27);
    masterGain.gain.setValueAtTime(0.2, now + 0.42);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.45);

    // Third beep
    osc.frequency.setValueAtTime(660, now + 0.55);
    masterGain.gain.setValueAtTime(0, now + 0.55);
    masterGain.gain.linearRampToValueAtTime(0.2, now + 0.57);
    masterGain.gain.setValueAtTime(0.2, now + 0.72);
    masterGain.gain.linearRampToValueAtTime(0, now + 0.75);

    // Fourth beep (higher)
    osc.frequency.setValueAtTime(880, now + 0.85);
    masterGain.gain.setValueAtTime(0, now + 0.85);
    masterGain.gain.linearRampToValueAtTime(0.2, now + 0.87);
    masterGain.gain.setValueAtTime(0.2, now + 1.02);
    masterGain.gain.linearRampToValueAtTime(0, now + 1.05);

    // Then silence for the rest of the 3s cycle
    step++;
  };

  playPattern();
  const intervalId = setInterval(playPattern, 3000);

  return { oscillators: [osc], gains: [masterGain], intervalId };
}

export function useCallSounds() {
  const soundRef = useRef<SoundState | null>(null);
  const currentTypeRef = useRef<SoundType | null>(null);

  const stopSound = useCallback(() => {
    const sound = soundRef.current;
    if (!sound) return;

    if (sound.intervalId) clearInterval(sound.intervalId);

    sound.oscillators.forEach((osc) => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    sound.gains.forEach((g) => {
      try { g.disconnect(); } catch { /* already disconnected */ }
    });

    try { sound.ctx.close(); } catch { /* ignore */ }

    soundRef.current = null;
    currentTypeRef.current = null;
  }, []);

  const playSound = useCallback((type: SoundType) => {
    // Don't restart the same sound
    if (currentTypeRef.current === type && soundRef.current) return;

    // Stop any currently playing sound
    stopSound();

    try {
      const ctx = new AudioContext();
      let result: { oscillators: OscillatorNode[]; gains: GainNode[]; intervalId: ReturnType<typeof setInterval> };

      if (type === 'dialtone') {
        result = createDialtone(ctx);
      } else {
        result = createRingtone(ctx);
      }

      soundRef.current = {
        ctx,
        oscillators: result.oscillators,
        gains: result.gains,
        intervalId: result.intervalId,
      };
      currentTypeRef.current = type;
    } catch (err) {
      console.warn('[useCallSounds] Could not create audio context:', err);
    }
  }, [stopSound]);

  return { playSound, stopSound };
}
