/** Shared design tokens. Dark "lab bench" palette with a teal instrument accent. */

export const colors = {
  bg: '#080B12',
  bgElevated: '#0E131D',
  surface: '#141B27',
  surfaceAlt: '#1B2433',
  surfacePressed: '#222D3E',
  stroke: '#253042',
  strokeSoft: '#1C2534',

  text: '#E9F0FA',
  textMuted: '#93A2B8',
  textFaint: '#5C6B82',

  accent: '#2DE1C2',
  accentDim: '#1B8E7C',
  accentGlow: 'rgba(45,225,194,0.18)',

  blue: '#5AA2FF',
  amber: '#FFB454',
  rose: '#FF6B81',
  violet: '#A78BFA',

  disabled: '#2A3444',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
} as const;

export const type = {
  /** Tabular-ish monospace for every number the user is meant to read. */
  mono: 'monospace' as const,
};

/** Per-environment scene palette used by the canvas backdrop and ground. */
export const scenes = {
  earth: {
    skyTop: '#0A1830',
    skyMid: '#17406E',
    skyBottom: '#3E7FA8',
    haze: 'rgba(180,214,235,0.35)',
    groundTop: '#3E6B3A',
    groundMid: '#2A4A2A',
    groundBottom: '#16281A',
    grit: 'rgba(210,240,200,0.30)',
    stars: 0,
    accent: '#7ED9A0',
  },
  moon: {
    skyTop: '#000000',
    skyMid: '#04060C',
    skyBottom: '#0A0E16',
    haze: 'rgba(140,150,170,0.10)',
    groundTop: '#8E8E92',
    groundMid: '#5A5A60',
    groundBottom: '#2A2A30',
    grit: 'rgba(255,255,255,0.30)',
    stars: 90,
    accent: '#C9CBD4',
  },
  mars: {
    skyTop: '#2A1208',
    skyMid: '#7A3A18',
    skyBottom: '#C2743C',
    haze: 'rgba(240,190,140,0.30)',
    groundTop: '#A64B22',
    groundMid: '#6E2E14',
    groundBottom: '#3A170A',
    grit: 'rgba(255,200,150,0.30)',
    stars: 0,
    accent: '#FF9A5A',
  },
  zerog: {
    skyTop: '#03040A',
    skyMid: '#070B18',
    skyBottom: '#0B1024',
    haze: 'rgba(120,140,200,0.10)',
    groundTop: 'transparent',
    groundMid: 'transparent',
    groundBottom: 'transparent',
    grit: 'rgba(255,255,255,0.0)',
    stars: 140,
    accent: '#9DB4FF',
  },
} as const;

export type SceneName = keyof typeof scenes;
