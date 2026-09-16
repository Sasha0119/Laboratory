/**
 * Circuit audio: a soft continuous hum while current is flowing, and a sharp
 * spark on burnout. Same expo-audio pattern as `useImpactSound` — one player
 * per sound, created once and reused rather than instantiated on the fly.
 */

import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect } from 'react';

const HUM_SOURCE = require('../assets/sounds/circuit-hum.wav');
const SPARK_SOURCE = require('../assets/sounds/circuit-spark.wav');

/** Current, in amps, above which the hum is already at full volume. */
const HUM_REFERENCE_CURRENT = 1.5;

export function useCircuitSound() {
  const hum = useAudioPlayer(HUM_SOURCE);
  const spark = useAudioPlayer(SPARK_SOURCE);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => {}
    );
  }, []);

  useEffect(() => {
    hum.loop = true;
  }, [hum]);

  /**
   * Call every render with the live current; starts, stops and fades the hum.
   *
   * Reads `hum.playing` rather than tracking a local flag, because on the web
   * `play()` can silently fail to start — the browser's autoplay policy
   * blocking it before any user gesture, most likely, since the switch
   * defaults to closed. Checking the player's own state rather than assuming
   * our call succeeded means the next tick with current flowing simply tries
   * again, and it starts working the moment the reader taps anything.
   */
  const setFlow = useCallback(
    (currentAmps: number) => {
      const level = Math.min(1, Math.max(0, currentAmps / HUM_REFERENCE_CURRENT));
      try {
        if (level > 0.005) {
          hum.volume = 0.04 + 0.16 * level;
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

  const playSpark = useCallback(() => {
    try {
      spark.volume = 0.7;
      spark.seekTo(0);
      spark.play();
    } catch {
      // Ignored — see above.
    }
  }, [spark]);

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

  return { setFlow, playSpark };
}
