/**
 * Impact audio.
 *
 * One player per material, created once and reused, because instantiating a
 * player at the moment of impact adds enough latency to break the illusion.
 * Loudness and pitch come from the simulation's own numbers via
 * `impactProfile`, so the same football sounds different from 2 m and 80 m.
 */

import { useCallback } from 'react';
import { useAudioPlayer, type SoundPlayer } from './useAudioPlayer';
import type { ImpactProfile } from '../lib/effects/impact';
import type { MaterialId } from '../lib/physics/presets';

// Served from /public/sounds.
const SOURCES = {
  rubber: '/sounds/impact-rubber.wav',
  glass: '/sounds/impact-glass.wav',
  paper: '/sounds/impact-paper.wav',
  soft: '/sounds/impact-soft.wav',
};

export function useImpactSound() {
  const rubber = useAudioPlayer(SOURCES.rubber);
  const glass = useAudioPlayer(SOURCES.glass);
  const paper = useAudioPlayer(SOURCES.paper);
  const soft = useAudioPlayer(SOURCES.soft);


  return useCallback(
    (material: MaterialId, profile: ImpactProfile) => {
      const players: Record<MaterialId, SoundPlayer> = { rubber, glass, paper, soft };
      const player = players[material] ?? rubber;
      try {
        player.volume = profile.volume;
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
