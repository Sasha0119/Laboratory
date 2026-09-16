/**
 * Magnetism audio: an ambient hum that rises in pitch and volume with force,
 * and a sharp click when two attracting magnets snap together. Same
 * expo-audio pattern as `useCircuitSound` — one player per sound, created
 * once and reused.
 */

import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect } from 'react';

const HUM_SOURCE = require('../assets/sounds/magnet-hum.wav');
const CLICK_SOURCE = require('../assets/sounds/magnet-click.wav');

export function useMagnetSound() {
  const hum = useAudioPlayer(HUM_SOURCE);
  const click = useAudioPlayer(CLICK_SOURCE);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => {}
    );
  }, []);

  useEffect(() => {
    hum.loop = true;
  }, [hum]);

  /**
   * Call every render with the live 0..1 force fraction. Reads `hum.playing`
   * rather than a local flag for the same reason as the circuit hum: on the
   * web the very first `play()` is routinely blocked until the reader makes
   * a gesture, so the next call simply tries again instead of staying silent.
   */
  const setForce = useCallback(
    (fraction: number) => {
      const level = Math.min(1, Math.max(0, fraction));
      try {
        if (level > 0.01) {
          hum.volume = 0.04 + 0.18 * level;
          // Pitch correction off: the rate change IS the pitch rise.
          hum.shouldCorrectPitch = false;
          hum.playbackRate = 0.85 + 0.5 * level;
          if (!hum.playing) hum.play();
        } else if (hum.playing) {
          hum.pause();
        }
      } catch {
        // Audio is a nicety; never let it take the simulation down with it.
      }
    },
    [hum]
  );

  const playClick = useCallback(() => {
    try {
      click.volume = 0.75;
      click.seekTo(0);
      click.play();
    } catch {
      // Ignored — see above.
    }
  }, [click]);

  useEffect(
    () => () => {
      try {
        hum.pause();
      } catch {
        // Unmounting anyway.
      }
    },
    [hum]
  );

  return { setForce, playClick };
}
