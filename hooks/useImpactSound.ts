/**
 * Impact audio.
 *
 * One player per material, created once and reused, because instantiating a
 * player at the moment of impact adds enough latency to break the illusion.
 * Loudness and pitch come from the simulation's own numbers via
 * `impactProfile`, so the same football sounds different from 2 m and 80 m.
 *
 * expo-av was removed in SDK 55; `expo-audio` is its replacement and is what
 * the current SDK ships.
 */

import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect } from 'react';
import type { ImpactProfile } from '../lib/effects/impact';
import type { MaterialId } from '../lib/physics/presets';

// Static requires: Metro needs these resolvable at build time.
const SOURCES = {
  rubber: require('../assets/sounds/impact-rubber.wav'),
  glass: require('../assets/sounds/impact-glass.wav'),
  paper: require('../assets/sounds/impact-paper.wav'),
  soft: require('../assets/sounds/impact-soft.wav'),
};

export function useImpactSound() {
  const rubber = useAudioPlayer(SOURCES.rubber);
  const glass = useAudioPlayer(SOURCES.glass);
  const paper = useAudioPlayer(SOURCES.paper);
  const soft = useAudioPlayer(SOURCES.soft);

  useEffect(() => {
    // Play through the silent switch: a physics demo with muted impacts is
    // worse than one with no audio at all.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(
      () => {}
    );
  }, []);

  return useCallback(
    (material: MaterialId, profile: ImpactProfile) => {
      const players: Record<MaterialId, AudioPlayer> = { rubber, glass, paper, soft };
      const player = players[material] ?? rubber;
      try {
        player.volume = profile.volume;
        // Pitch correction off on purpose — the rate change IS the pitch change,
        // which is what makes a fast impact sound sharper.
        player.shouldCorrectPitch = false;
        player.playbackRate = profile.pitch;
        player.seekTo(0);
        player.play();
      } catch {
        // Audio is a nicety; never let it take the simulation down with it.
      }
    },
    [rubber, glass, paper, soft]
  );
}
