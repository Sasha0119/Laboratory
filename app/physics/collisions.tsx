import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Readout, type DetailRow, type Stat } from '../../components/readout/Readout';
import { PresetPicker } from '../../components/sim/PresetPicker';
import { TrackScene, trackScale } from '../../components/sim/TrackScene';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Segmented';
import { ValueSlider } from '../../components/ui/ValueSlider';
import { useDetailMode } from '../../context/DetailMode';
import { useCollisionSim } from '../../hooks/useCollisionSim';
import { useImpactSound } from '../../hooks/useImpactSound';
import {
  DEFAULT_RESTITUTION,
  restitutionFor,
  type CollisionKind,
  type CollisionParams,
} from '../../lib/physics/collision';
import { PRESETS_BY_ID, type MaterialId, type ObjectPreset } from '../../lib/physics/presets';
import { directionWord, friendly, precise, speedComparison } from '../../lib/format';
import { colors, radius, spacing } from '../../theme';

/** Track runs from -HALF_TRACK to +HALF_TRACK metres, with end stops. */
const HALF_TRACK = 4;
const START_A = -2.6;
const START_B = 2.6;

/** Drawn radius bounds in pixels; the world radius is derived from these. */
const MIN_RADIUS_PX = 12;
const MAX_RADIUS_PX = 32;
/** The object size that maps to the top of the drawn range. */
const SIZE_REFERENCE = 0.3;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const KINDS: { value: CollisionKind; label: string }[] = [
  { value: 'bouncy', label: 'Bouncy' },
  { value: 'sticky', label: 'Sticky' },
  { value: 'realistic', label: 'Realistic' },
];

const KIND_BLURB: Record<CollisionKind, string> = {
  bouncy: 'They bounce apart and keep all their energy. Nothing is lost.',
  sticky: 'They join together on impact and move off as one lump.',
  realistic: 'What usually happens: they bounce, but lose some energy as heat and sound.',
};

/** Impact sound per collision type: sharp for bouncy, dull for sticky. */
const KIND_SOUND: Record<CollisionKind, MaterialId> = {
  bouncy: 'glass',
  sticky: 'paper',
  realistic: 'rubber',
};

const SPEEDS = [
  { value: '0.25', label: '¼×' },
  { value: '1', label: '1×' },
  { value: '2', label: '2×' },
];

export default function CollisionsSimulator() {
  const insets = useSafeAreaInsets();
  const { detailed } = useDetailMode();

  // ------------------------------------------------------------ parameters
  const [presetAId, setPresetAId] = useState('ball');
  const [presetBId, setPresetBId] = useState('marble');
  const baseA = PRESETS_BY_ID[presetAId];
  const baseB = PRESETS_BY_ID[presetBId];

  const [massA, setMassA] = useState(baseA.mass);
  const [massB, setMassB] = useState(baseB.mass);
  const [velocityA, setVelocityA] = useState(4);
  const [velocityB, setVelocityB] = useState(-2);

  const [kind, setKind] = useState<CollisionKind>('realistic');
  const [bounciness, setBounciness] = useState(DEFAULT_RESTITUTION);
  const [timeScale, setTimeScale] = useState('1');

  const presetA: ObjectPreset = useMemo(() => ({ ...baseA, mass: massA }), [baseA, massA]);
  const presetB: ObjectPreset = useMemo(() => ({ ...baseB, mass: massB }), [baseB, massB]);

  // ---------------------------------------------------------------- layout
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const onCanvasLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
        ? prev
        : { width, height }
    );
  }, []);

  /**
   * Contact radii, in metres.
   *
   * Derived from the drawn pixel size so the objects collide exactly when they
   * appear to touch. A 16 mm marble would otherwise be a fraction of a pixel
   * across. This is safe: the radius only decides *when and where* contact
   * happens — the velocities afterwards depend solely on the masses, the
   * incoming velocities and the bounciness.
   */
  const scale = canvas.width > 0 ? trackScale(canvas.width, HALF_TRACK) : 40;
  const radiusFor = useCallback(
    (preset: ObjectPreset) => {
      // Real sizes span 16 mm (marble) to 230 mm (book) — a factor of fourteen.
      // Drawn to scale on a 8 m track the marble would vanish, but clamping
      // both to a minimum would make them look identical. So map size through
      // a log curve onto the pixel range: still strictly ordered, just
      // compressed, so a ball plainly reads as bigger than a marble.
      const t = clamp01(
        Math.log(preset.sizeMeters / 0.01) / Math.log(SIZE_REFERENCE / 0.01)
      );
      const px = MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * t;
      return px / scale;
    },
    [scale]
  );
  const radiusA = radiusFor(presetA);
  const radiusB = radiusFor(presetB);

  const params: CollisionParams = useMemo(
    () => ({
      a: { mass: massA, velocity: velocityA, position: START_A, radius: radiusA },
      b: { mass: massB, velocity: velocityB, position: START_B, radius: radiusB },
      kind,
      restitution: bounciness,
      halfTrack: HALF_TRACK,
    }),
    [massA, velocityA, radiusA, massB, velocityB, radiusB, kind, bounciness]
  );

  // ------------------------------------------------------------ simulation
  const playImpact = useImpactSound();

  const onImpact = useCallback(
    (_event: unknown, profile: Parameters<typeof playImpact>[1]) => {
      playImpact(KIND_SOUND[kind], profile);
      if (Platform.OS !== 'web') {
        const style =
          profile.shake > 6
            ? Haptics.ImpactFeedbackStyle.Heavy
            : profile.shake > 2
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(style).catch(() => {});
      }
    },
    [playImpact, kind]
  );

  const { phase, frame, event, outcome, start, reset, setProjector } = useCollisionSim({
    params,
    speedMultiplier: Number(timeScale),
    onImpact,
  });

  const running = phase === 'running' || phase === 'settling';

  /** Editing anything after a run puts the objects back on their marks. */
  useEffect(() => {
    if (phase === 'done') reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const willNeverMeet = velocityA <= velocityB;

  // ---------------------------------------------------------------- readout
  const speedReference = Math.max(Math.abs(velocityA), Math.abs(velocityB), 1) * 1.15;

  const liveStats: Stat[] = useMemo(
    () => [
      {
        key: 'a',
        label: `${baseA.label} speed`,
        value: Math.abs(frame.aVelocity),
        unit: 'm/s',
        fill: Math.abs(frame.aVelocity) / speedReference,
        showTrend: running,
        caption:
          frame.aVelocity === 0 ? 'stopped' : `moving ${directionWord(frame.aVelocity)}`,
      },
      {
        key: 'b',
        label: `${baseB.label} speed`,
        value: Math.abs(frame.bVelocity),
        unit: 'm/s',
        fill: Math.abs(frame.bVelocity) / speedReference,
        showTrend: running,
        tone: colors.blue,
        caption:
          frame.bVelocity === 0 ? 'stopped' : `moving ${directionWord(frame.bVelocity)}`,
      },
    ],
    [frame.aVelocity, frame.bVelocity, baseA.label, baseB.label, speedReference, running]
  );

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const rows: DetailRow[] = [
      { label: 'Time  t', value: precise(frame.t, 4), unit: 's' },
      { label: `${baseA.label}  m₁`, value: precise(massA, 4), unit: 'kg' },
      { label: `${baseA.label}  v₁`, value: precise(frame.aVelocity, 4), unit: 'm/s' },
      { label: `${baseA.label}  x₁`, value: precise(frame.aPosition, 3), unit: 'm' },
      { label: `${baseB.label}  m₂`, value: precise(massB, 4), unit: 'kg' },
      { label: `${baseB.label}  v₂`, value: precise(frame.bVelocity, 4), unit: 'm/s' },
      { label: `${baseB.label}  x₂`, value: precise(frame.bPosition, 3), unit: 'm' },
      { label: 'Restitution  e', value: precise(restitutionFor(kind, bounciness), 2), unit: '' },
      {
        label: 'Momentum  p',
        value: precise(massA * frame.aVelocity + massB * frame.bVelocity, 4),
        unit: 'kg·m/s',
      },
      {
        label: 'Kinetic energy  KE',
        value: precise(
          0.5 * massA * frame.aVelocity ** 2 + 0.5 * massB * frame.bVelocity ** 2,
          4
        ),
        unit: 'J',
      },
    ];
    if (event) {
      rows.push(
        { label: '— before impact —', value: '', unit: '' },
        { label: "v₁ before", value: precise(event.aBefore, 4), unit: 'm/s' },
        { label: "v₂ before", value: precise(event.bBefore, 4), unit: 'm/s' },
        { label: "v₁ after", value: precise(event.aAfter, 4), unit: 'm/s' },
        { label: "v₂ after", value: precise(event.bAfter, 4), unit: 'm/s' },
        { label: 'p before', value: precise(event.momentumBefore, 5), unit: 'kg·m/s' },
        { label: 'p after', value: precise(event.momentumAfter, 5), unit: 'kg·m/s' },
        { label: 'KE before', value: precise(event.energyBefore, 4), unit: 'J' },
        { label: 'KE after', value: precise(event.energyAfter, 4), unit: 'J' },
        { label: 'Energy lost', value: precise(event.energyLost, 4), unit: 'J' }
      );
    }
    return rows;
  }, [detailed, frame, massA, massB, kind, bounciness, event, baseA.label, baseB.label]);

  /** One plain sentence about what happened. */
  const message = useMemo(() => {
    if (phase === 'idle') {
      return willNeverMeet
        ? 'These two will never meet — give them speeds that bring them together.'
        : null;
    }
    if (!event) {
      return outcome === 'no-contact' ? 'They never touched.' : null;
    }
    const lostPercent =
      event.energyBefore > 0 ? (event.energyLost / event.energyBefore) * 100 : 0;
    if (event.stuck) {
      return `They stuck together and moved off ${directionWord(event.aAfter)} at ${friendly(
        Math.abs(event.aAfter)
      )} m/s. ${Math.round(lostPercent)}% of the energy was lost as heat and sound — but the total momentum did not change.`;
    }
    const after =
      `${baseA.label} went off ${directionWord(event.aAfter)} at ${friendly(
        Math.abs(event.aAfter)
      )} m/s, ${baseB.label} ${directionWord(event.bAfter)} at ${friendly(
        Math.abs(event.bAfter)
      )} m/s.`;
    if (lostPercent < 0.5) {
      return `${after} They kept all of their energy, and the total momentum is exactly what it was before.`;
    }
    return `${after} They lost ${Math.round(
      lostPercent
    )}% of their energy as heat and sound, but the total momentum is unchanged.`;
  }, [phase, event, outcome, willNeverMeet, baseA.label, baseB.label]);

  // ---------------------------------------------------------------- render
  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <TrackScene
            width={canvas.width}
            height={canvas.height}
            halfTrack={HALF_TRACK}
            presetA={presetA}
            presetB={presetB}
            radiusA={radiusA}
            radiusB={radiusB}
            frame={frame}
            running={running}
            onProjector={setProjector}
          />
        ) : null}
        <View style={[styles.badge, { pointerEvents: 'none' }]}>
          <Text style={styles.badgeText}>{KINDS.find((k) => k.value === kind)?.label}</Text>
          <Text style={styles.badgeDim}>
            {kind === 'realistic' ? `bounciness ${bounciness.toFixed(2)}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        <Readout stats={liveStats} details={liveDetails} message={message} />

        <Card title="What happens when they meet">
          <Segmented<CollisionKind>
            options={KINDS}
            value={kind}
            onChange={setKind}
            disabled={running}
            tint={kind === 'sticky' ? colors.amber : colors.accent}
          />
          <Text style={styles.blurb}>{KIND_BLURB[kind]}</Text>
          {kind === 'realistic' ? (
            <View style={styles.bounceSlider}>
              <ValueSlider
                label="Bounciness"
                value={bounciness}
                min={0}
                max={1}
                precision={2}
                disabled={running}
                onChange={setBounciness}
                hint="0 sticks together · 1 bounces perfectly"
              />
            </View>
          ) : null}
        </Card>

        <ObjectCard
          title="Left object"
          presetId={presetAId}
          onPreset={(p) => {
            setPresetAId(p.id);
            setMassA(p.mass);
          }}
          mass={massA}
          onMass={setMassA}
          velocity={velocityA}
          onVelocity={setVelocityA}
          disabled={running}
          tone={colors.accent}
        />

        <ObjectCard
          title="Right object"
          presetId={presetBId}
          onPreset={(p) => {
            setPresetBId(p.id);
            setMassB(p.mass);
          }}
          mass={massB}
          onMass={setMassB}
          velocity={velocityB}
          onVelocity={setVelocityB}
          disabled={running}
          tone={colors.blue}
        />

        <Card title="Playback">
          <Segmented
            options={SPEEDS}
            value={timeScale}
            onChange={setTimeScale}
            compact
            disabled={running}
          />
        </Card>

        <Text style={styles.credits}>
          Momentum (mass × speed, added up) is the same before and after every collision here —
          that is a law, not an approximation. Energy is only preserved when the objects are
          perfectly bouncy.
        </Text>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          label={running ? 'Running…' : 'Run'}
          icon={running ? undefined : '▶'}
          onPress={start}
          disabled={running}
          flex={2}
        />
        <Button label="Reset" variant="ghost" onPress={reset} flex={1} />
      </View>
    </View>
  );
}

function ObjectCard({
  title,
  presetId,
  onPreset,
  mass,
  onMass,
  velocity,
  onVelocity,
  disabled,
  tone,
}: {
  title: string;
  presetId: string;
  onPreset: (p: ObjectPreset) => void;
  mass: number;
  onMass: (v: number) => void;
  velocity: number;
  onVelocity: (v: number) => void;
  disabled: boolean;
  tone: string;
}) {
  const comparison = speedComparison(velocity);
  return (
    <Card title={title} accessory={comparison ?? undefined}>
      <PresetPicker value={presetId} onChange={onPreset} disabled={disabled} />
      <View style={styles.objectSliders}>
        <ValueSlider
          label="Mass"
          value={mass}
          min={0.001}
          max={50}
          unit="kg"
          precision={2}
          logarithmic
          disabled={disabled}
          onChange={onMass}
        />
        <ValueSlider
          label="Starting speed"
          value={velocity}
          min={-15}
          max={15}
          unit="m/s"
          precision={1}
          disabled={disabled}
          onChange={onVelocity}
          hint={
            velocity === 0
              ? 'Sitting still'
              : `Moving ${directionWord(velocity)}${
                  Math.abs(velocity) > 0 ? ` at ${friendly(Math.abs(velocity))} m/s` : ''
                }`
          }
        />
      </View>
      <View style={[styles.toneBar, { backgroundColor: tone }]} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  canvas: {
    height: '30%',
    minHeight: 190,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
  },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(8,11,18,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  badgeDim: { color: colors.textFaint, fontSize: 10 },

  controls: { flex: 1 },
  controlsContent: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },

  blurb: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  bounceSlider: { marginTop: spacing.md },
  objectSliders: { marginTop: spacing.md },
  toneBar: {
    height: 2,
    borderRadius: radius.pill,
    opacity: 0.5,
    marginTop: spacing.xs,
  },

  credits: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.stroke,
  },
});
