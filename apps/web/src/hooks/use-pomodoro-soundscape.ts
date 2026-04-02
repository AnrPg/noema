'use client';

import * as React from 'react';
import type { PomodoroSettingsDto } from '@noema/api-client';

type Soundscape = PomodoroSettingsDto['soundscape'];

interface IUsePomodoroSoundscapeOptions {
  enabled: boolean;
  soundscape: Soundscape;
  volume: number;
}

type SoundscapeTeardown = () => void;

function createNoiseBuffer(
  context: AudioContext,
  tint: 'white' | 'brown',
  durationSeconds = 2
): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * durationSeconds, context.sampleRate);
  const channelData = buffer.getChannelData(0);
  let lastBrown = 0;

  for (let index = 0; index < channelData.length; index += 1) {
    const white = Math.random() * 2 - 1;
    if (tint === 'brown') {
      lastBrown = (lastBrown + 0.02 * white) / 1.02;
      channelData[index] = lastBrown * 3.5;
    } else {
      channelData[index] = white;
    }
  }

  return buffer;
}

function createNoiseSource(
  context: AudioContext,
  tint: 'white' | 'brown',
  destination: AudioNode
): SoundscapeTeardown {
  const source = context.createBufferSource();
  source.buffer = createNoiseBuffer(context, tint);
  source.loop = true;
  source.connect(destination);
  source.start();

  return () => {
    source.stop();
    source.disconnect();
  };
}

function createOscillatorLayer(
  context: AudioContext,
  destination: AudioNode,
  options: {
    type: OscillatorType;
    frequency: number;
    gain: number;
    detune?: number;
    modRate?: number;
    modDepth?: number;
  }
): SoundscapeTeardown {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const lfo = options.modRate !== undefined ? context.createOscillator() : null;
  const lfoGain = lfo !== null ? context.createGain() : null;

  oscillator.type = options.type;
  oscillator.frequency.value = options.frequency;
  oscillator.detune.value = options.detune ?? 0;
  gainNode.gain.value = options.gain;

  oscillator.connect(gainNode);
  gainNode.connect(destination);

  if (lfo !== null && lfoGain !== null) {
    lfo.type = 'sine';
    lfo.frequency.value = options.modRate ?? 0.08;
    lfoGain.gain.value = options.modDepth ?? 2.5;
    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    lfo.start();
  }

  oscillator.start();

  return () => {
    oscillator.stop();
    oscillator.disconnect();
    gainNode.disconnect();
    if (lfo !== null && lfoGain !== null) {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
    }
  };
}

function buildSoundscape(
  context: AudioContext,
  soundscape: Soundscape,
  destination: GainNode
): SoundscapeTeardown {
  const teardowns: SoundscapeTeardown[] = [];

  const add = (teardown: SoundscapeTeardown): void => {
    teardowns.push(teardown);
  };

  switch (soundscape) {
    case 'rain': {
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      filter.Q.value = 0.2;
      filter.connect(destination);
      add(createNoiseSource(context, 'white', filter));
      add(() => {
        filter.disconnect();
      });
      break;
    }
    case 'deep_focus': {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;
      filter.Q.value = 0.5;
      filter.connect(destination);
      add(createOscillatorLayer(context, filter, { type: 'sine', frequency: 196, gain: 0.08 }));
      add(
        createOscillatorLayer(context, filter, {
          type: 'triangle',
          frequency: 293.66,
          gain: 0.035,
          modRate: 0.05,
          modDepth: 4,
        })
      );
      add(() => {
        filter.disconnect();
      });
      break;
    }
    case 'cafe': {
      const noiseFilter = context.createBiquadFilter();
      noiseFilter.type = 'highpass';
      noiseFilter.frequency.value = 240;
      noiseFilter.connect(destination);

      const roomFilter = context.createBiquadFilter();
      roomFilter.type = 'lowpass';
      roomFilter.frequency.value = 420;
      roomFilter.connect(destination);

      add(createNoiseSource(context, 'white', noiseFilter));
      add(
        createOscillatorLayer(context, roomFilter, {
          type: 'sine',
          frequency: 82.41,
          gain: 0.03,
          modRate: 0.04,
          modDepth: 1.8,
        })
      );
      add(() => {
        noiseFilter.disconnect();
      });
      add(() => {
        roomFilter.disconnect();
      });
      break;
    }
    case 'night_owls': {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 640;
      filter.Q.value = 0.8;
      filter.connect(destination);
      add(createNoiseSource(context, 'brown', filter));
      add(
        createOscillatorLayer(context, filter, {
          type: 'triangle',
          frequency: 130.81,
          gain: 0.04,
          modRate: 0.03,
          modDepth: 2,
        })
      );
      add(() => {
        filter.disconnect();
      });
      break;
    }
    case 'none':
    default:
      break;
  }

  return () => {
    for (const teardown of teardowns.reverse()) {
      teardown();
    }
  };
}

export function usePomodoroSoundscape({
  enabled,
  soundscape,
  volume,
}: IUsePomodoroSoundscapeOptions): {
  unlockAudio: () => Promise<void>;
  playPreview: (nextSoundscape: Soundscape, nextVolume: number) => Promise<void>;
} {
  const contextRef = React.useRef<AudioContext | null>(null);
  const masterGainRef = React.useRef<GainNode | null>(null);
  const teardownRef = React.useRef<SoundscapeTeardown | null>(null);
  const previewTeardownRef = React.useRef<SoundscapeTeardown | null>(null);
  const previewTimeoutRef = React.useRef<number | null>(null);

  const ensureAudioContext = React.useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') {
      return null;
    }

    if (contextRef.current === null) {
      const context = new window.AudioContext();
      const masterGain = context.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(context.destination);

      contextRef.current = context;
      masterGainRef.current = masterGain;
    }

    if (contextRef.current.state === 'suspended') {
      await contextRef.current.resume();
    }

    return contextRef.current;
  }, []);

  const unlockAudio = React.useCallback(async (): Promise<void> => {
    await ensureAudioContext();
  }, [ensureAudioContext]);

  const stopPreview = React.useCallback((): void => {
    if (previewTimeoutRef.current !== null) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    previewTeardownRef.current?.();
    previewTeardownRef.current = null;
  }, []);

  const playPreview = React.useCallback(
    async (nextSoundscape: Soundscape, nextVolume: number): Promise<void> => {
      const context = await ensureAudioContext();
      if (context === null) {
        return;
      }

      stopPreview();

      if (nextSoundscape === 'none') {
        return;
      }

      const previewGain = context.createGain();
      previewGain.gain.value = 0;
      previewGain.connect(context.destination);

      const previewTeardown = buildSoundscape(context, nextSoundscape, previewGain);
      previewTeardownRef.current = () => {
        previewTeardown();
        previewGain.disconnect();
      };

      previewGain.gain.cancelScheduledValues(context.currentTime);
      previewGain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, nextVolume / 100)) * 0.22,
        context.currentTime + 0.12
      );
      previewGain.gain.linearRampToValueAtTime(0, context.currentTime + 2.5);

      previewTimeoutRef.current = window.setTimeout(() => {
        stopPreview();
      }, 2800);
    },
    [ensureAudioContext, stopPreview]
  );

  React.useEffect(() => {
    const masterGain = masterGainRef.current;
    const context = contextRef.current;

    if (context === null || masterGain === null) {
      return;
    }

    if (!enabled || soundscape === 'none') {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, context.currentTime + 0.18);
      teardownRef.current?.();
      teardownRef.current = null;
      return;
    }

    teardownRef.current?.();
    teardownRef.current = buildSoundscape(context, soundscape, masterGain);

    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(1, volume / 100)) * 0.26,
      context.currentTime + 0.24
    );

    return () => {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, context.currentTime + 0.18);
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, [enabled, soundscape, volume]);

  React.useEffect(() => {
    return () => {
      teardownRef.current?.();
      teardownRef.current = null;
      stopPreview();
      masterGainRef.current?.disconnect();
      const context = contextRef.current;
      contextRef.current = null;
      masterGainRef.current = null;
      if (context !== null && context.state !== 'closed') {
        void context.close();
      }
    };
  }, []);

  return { unlockAudio, playPreview };
}
