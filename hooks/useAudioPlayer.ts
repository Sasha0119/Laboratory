import { useRef } from 'react';

import { isSoundEnabled } from '../lib/soundSettings';

/**
 * A reusable sound, backed by one `HTMLAudioElement`.
 *
 * The element is created on first use rather than on construction, so the
 * hook is safe to call while the page is being rendered on the server. Every
 * method swallows the rejections browsers raise when autoplay is blocked: the
 * caller reads `playing` on the next tick and simply tries again once the
 * visitor has interacted with the page.
 */
export class SoundPlayer {
  volume = 1;
  playbackRate = 1;
  loop = false;
  private el: HTMLAudioElement | null = null;

  constructor(private readonly src: string) {}

  private element(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null;
    if (!this.el) {
      this.el = new Audio(this.src);
      this.el.preload = 'auto';
      // The rate change IS the pitch change, which is what makes a fast impact
      // sound sharper — so do not let the browser correct it.
      this.el.preservesPitch = false;
    }
    return this.el;
  }

  get playing(): boolean {
    // Muting silences a sound that is already running, such as a hum.
    if (!isSoundEnabled()) {
      this.el?.pause();
      return false;
    }
    const el = this.el;
    return !!el && !el.paused && !el.ended;
  }

  play(): void {
    if (!isSoundEnabled()) return;
    const el = this.element();
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, this.volume));
    el.playbackRate = this.playbackRate;
    el.loop = this.loop;
    el.play().catch(() => {
      // Blocked until the visitor interacts with the page; try again later.
    });
  }

  pause(): void {
    this.el?.pause();
  }

  seekTo(seconds: number): void {
    const el = this.element();
    if (el) el.currentTime = seconds;
  }
}

/** One stable player per component instance, for one sound file. */
export function useAudioPlayer(src: string): SoundPlayer {
  const ref = useRef<SoundPlayer | null>(null);
  if (!ref.current) ref.current = new SoundPlayer(src);
  return ref.current;
}
