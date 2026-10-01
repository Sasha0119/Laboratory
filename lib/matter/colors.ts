import { hexToRgb } from '../color';

/**
 * The colour of heat: blue when cold, through cyan and amber, to red when hot.
 * `level` is 0..1 within the substance's own temperature window (see
 * `heatLevel` in `lib/physics/thermo`), so every substance uses the whole
 * range, whether it melts at 0 °C or at 1538 °C.
 */
const STOPS: { at: number; hex: string }[] = [
  { at: 0, hex: '#4F8BFF' },
  { at: 0.3, hex: '#7FE0F0' },
  { at: 0.55, hex: '#FFD27A' },
  { at: 0.78, hex: '#FF9A4D' },
  { at: 1, hex: '#FF4D5E' },
];

export function heatRgb(level: number): { r: number; g: number; b: number } {
  const u = Math.min(1, Math.max(0, level));
  for (let i = 1; i < STOPS.length; i++) {
    if (u <= STOPS[i].at) {
      const a = STOPS[i - 1];
      const b = STOPS[i];
      const t = (u - a.at) / (b.at - a.at);
      const pa = hexToRgb(a.hex);
      const pb = hexToRgb(b.hex);
      return {
        r: Math.round(pa.r + (pb.r - pa.r) * t),
        g: Math.round(pa.g + (pb.g - pa.g) * t),
        b: Math.round(pa.b + (pb.b - pa.b) * t),
      };
    }
  }
  return hexToRgb(STOPS[STOPS.length - 1].hex);
}

export function heatColor(level: number, alpha = 1): string {
  const { r, g, b } = heatRgb(level);
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
