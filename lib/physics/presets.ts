/**
 * Object presets.
 *
 * Every preset carries the three quantities that actually appear in the drag
 * equation — mass m, drag coefficient Cd, and reference (cross-sectional)
 * area A — chosen from real-world measurements rather than tuned by eye.
 *
 * The quick sanity check for any of these is terminal velocity:
 *
 *     v_terminal = sqrt( 2 m g / (rho * Cd * A) )
 *
 * The commented value next to each preset is that number on Earth. If you
 * change a preset, recompute it — `terminalVelocity()` in `drag.ts` is the
 * same formula and the unit tests assert these stay in a believable band.
 */

export type ShapeId = 'circle' | 'square' | 'disc' | 'feather';

/** Sound character used to pick an impact sample and its pitch. */
export type MaterialId = 'rubber' | 'glass' | 'paper' | 'soft';

export interface ObjectPreset {
  id: string;
  label: string;
  /** kg */
  mass: number;
  /** Dimensionless drag coefficient. */
  dragCoefficient: number;
  /** Reference area presented to the airflow, m^2. */
  area: number;
  shape: ShapeId;
  material: MaterialId;
  /** Rendered size in metres (largest dimension) — visual only. */
  sizeMeters: number;
  /**
   * How much the object tumbles as it falls. Purely a rendering hint: it
   * drives a visual wobble and spin, and is deliberately NOT fed back into
   * the equations of motion, so vertical fall times stay exact.
   */
  tumble: number;
  /** Only "Custom" lets the user edit mass/Cd/area/shape freely. */
  editable: boolean;
  blurb: string;
}

export const PRESETS: ObjectPreset[] = [
  {
    id: 'ball',
    label: 'Ball',
    // Regulation size-5 football: 430 g, 22 cm across.
    mass: 0.43,
    dragCoefficient: 0.47, // smooth sphere
    area: Math.PI * 0.11 * 0.11, // 0.0380 m^2
    shape: 'circle',
    material: 'rubber',
    sizeMeters: 0.22,
    tumble: 0.05,
    editable: false,
    blurb: 'Football · sphere, Cd 0.47',
    // v_terminal on Earth ~= 19.7 m/s
  },
  {
    id: 'marble',
    label: 'Marble',
    // 16 mm glass marble: glass at 2500 kg/m^3 gives ~5.4 g.
    mass: 0.0054,
    dragCoefficient: 0.47,
    area: Math.PI * 0.008 * 0.008, // 2.011e-4 m^2
    shape: 'circle',
    material: 'glass',
    sizeMeters: 0.016,
    tumble: 0.02,
    editable: false,
    blurb: 'Glass, 16 mm · dense and slippery',
    // v_terminal on Earth ~= 30.2 m/s
  },
  {
    id: 'feather',
    label: 'Feather',
    // Body feather: well under a gram, but it presents a big, ragged,
    // constantly-reorienting surface, so its effective Cd is enormous.
    mass: 0.0008,
    dragCoefficient: 2.5,
    area: 0.008, // 80 cm^2 of vane
    shape: 'feather',
    material: 'soft',
    sizeMeters: 0.18,
    tumble: 1,
    editable: false,
    blurb: '0.8 g · huge area, Cd 2.5',
    // v_terminal on Earth ~= 0.80 m/s
  },
  {
    id: 'book',
    label: 'Book',
    // Hardcover, dropped flat: 15 cm x 23 cm face into the airflow.
    mass: 0.9,
    dragCoefficient: 1.2, // flat plate, face-on
    area: 0.15 * 0.23, // 0.0345 m^2
    shape: 'square',
    material: 'paper',
    sizeMeters: 0.23,
    tumble: 0.25,
    editable: false,
    blurb: 'Hardcover, falling flat · Cd 1.2',
    // v_terminal on Earth ~= 18.7 m/s
  },
  {
    id: 'custom',
    label: 'Custom',
    mass: 1,
    dragCoefficient: 1.1, // flat disc, face-on
    area: 0.05,
    shape: 'disc',
    material: 'rubber',
    sizeMeters: 0.25,
    tumble: 0.1,
    editable: true,
    blurb: 'Your numbers — edit everything',
  },
];

export const PRESETS_BY_ID: Record<string, ObjectPreset> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p])
);

/**
 * Textbook drag coefficients, offered when a Custom object changes shape.
 * Source values: sphere 0.47, cube face-on 1.05, flat disc face-on 1.1.
 */
export const SHAPE_DRAG: Record<ShapeId, number> = {
  circle: 0.47,
  square: 1.05,
  disc: 1.1,
  feather: 2.5,
};

export const SHAPE_LABELS: Record<ShapeId, string> = {
  circle: 'Sphere',
  square: 'Cube',
  disc: 'Disc',
  feather: 'Feather',
};
