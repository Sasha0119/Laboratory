import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { FormulaPanel } from '../../components/sim/FormulaPanel';
import { LevelBlurb } from '../../components/sim/LevelBlurb';
import { PresetPicker } from '../../components/sim/PresetPicker';
import { TrackScene, trackScale } from '../../components/sim/TrackScene';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Segmented';
import { NumberField } from '../../components/ui/NumberField';
import { useDetailMode } from '../../context/DetailMode';
import { useDifficulty } from '../../context/Difficulty';
import { LIMITS } from '../../lib/physics/constants';
import { usesPreciseTerms } from '../../lib/difficulty';
import { useCollisionSim } from '../../hooks/useCollisionSim';
import { useImpactSound } from '../../hooks/useImpactSound';
import {
  DEFAULT_RESTITUTION,
  restitutionFor,
  type CollisionKind,
  type CollisionParams,
} from '../../lib/physics/collision';
import { PRESETS_BY_ID, type MaterialId, type ObjectPreset } from '../../lib/physics/presets';
import { directionKey, friendly, precise, speedComparisonKey } from '../../lib/format';
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

/** Order of the picker. Labels come from `collisions.kinds.<id>`. */
const KIND_IDS: CollisionKind[] = ['bouncy', 'sticky', 'realistic'];

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
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);

  const nameOf = useCallback((id: string) => t(`presets.${id}.label`), [t]);
  const directionOf = useCallback(
    (velocity: number) => t(`directions.${directionKey(velocity)}`),
    [t]
  );

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
        label: t(precise_ ? 'collisions.stats.velocityOf' : 'collisions.stats.speedOf', {
          name: nameOf(baseA.id),
        }),
        value: Math.abs(frame.aVelocity),
        unit: 'm/s',
        fill: Math.abs(frame.aVelocity) / speedReference,
        showTrend: running,
        caption:
          frame.aVelocity === 0
            ? t('collisions.stats.stopped')
            : t('collisions.stats.movingDirection', { direction: directionOf(frame.aVelocity) }),
      },
      {
        key: 'b',
        label: t(precise_ ? 'collisions.stats.velocityOf' : 'collisions.stats.speedOf', {
          name: nameOf(baseB.id),
        }),
        value: Math.abs(frame.bVelocity),
        unit: 'm/s',
        fill: Math.abs(frame.bVelocity) / speedReference,
        showTrend: running,
        tone: colors.blue,
        caption:
          frame.bVelocity === 0
            ? t('collisions.stats.stopped')
            : t('collisions.stats.movingDirection', { direction: directionOf(frame.bVelocity) }),
      },
    ],
    [
      frame.aVelocity,
      frame.bVelocity,
      baseA.id,
      baseB.id,
      speedReference,
      running,
      t,
      nameOf,
      directionOf,
      precise_,
    ]
  );

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const rows: DetailRow[] = [
      { label: t('details.time'), value: precise(frame.t, 4), unit: 's' },
      { label: `${nameOf(baseA.id)}  m₁`, value: precise(massA, 4), unit: 'kg' },
      { label: `${nameOf(baseA.id)}  v₁`, value: precise(frame.aVelocity, 4), unit: 'm/s' },
      { label: `${nameOf(baseA.id)}  x₁`, value: precise(frame.aPosition, 3), unit: 'm' },
      { label: `${nameOf(baseB.id)}  m₂`, value: precise(massB, 4), unit: 'kg' },
      { label: `${nameOf(baseB.id)}  v₂`, value: precise(frame.bVelocity, 4), unit: 'm/s' },
      { label: `${nameOf(baseB.id)}  x₂`, value: precise(frame.bPosition, 3), unit: 'm' },
      {
        label: t('collisions.details.restitution'),
        value: precise(restitutionFor(kind, bounciness), 2),
        unit: '',
      },
      {
        label: t('collisions.details.momentum'),
        value: precise(massA * frame.aVelocity + massB * frame.bVelocity, 4),
        unit: 'kg·m/s',
      },
      {
        label: t('collisions.details.kineticEnergy'),
        value: precise(
          0.5 * massA * frame.aVelocity ** 2 + 0.5 * massB * frame.bVelocity ** 2,
          4
        ),
        unit: 'J',
      },
    ];
    if (event) {
      rows.push(
        { label: t('collisions.details.beforeImpact'), value: '', unit: '' },
        { label: t('collisions.details.vBefore', { symbol: 'v₁' }), value: precise(event.aBefore, 4), unit: 'm/s' },
        { label: t('collisions.details.vBefore', { symbol: 'v₂' }), value: precise(event.bBefore, 4), unit: 'm/s' },
        { label: t('collisions.details.vAfter', { symbol: 'v₁' }), value: precise(event.aAfter, 4), unit: 'm/s' },
        { label: t('collisions.details.vAfter', { symbol: 'v₂' }), value: precise(event.bAfter, 4), unit: 'm/s' },
        { label: t('collisions.details.momentumBefore'), value: precise(event.momentumBefore, 5), unit: 'kg·m/s' },
        { label: t('collisions.details.momentumAfter'), value: precise(event.momentumAfter, 5), unit: 'kg·m/s' },
        { label: t('collisions.details.energyBefore'), value: precise(event.energyBefore, 4), unit: 'J' },
        { label: t('collisions.details.energyAfter'), value: precise(event.energyAfter, 4), unit: 'J' },
        { label: t('collisions.details.energyLost'), value: precise(event.energyLost, 4), unit: 'J' }
      );
    }
    return rows;
  }, [detailed, frame, massA, massB, kind, bounciness, event, baseA.id, baseB.id, t, nameOf]);

  /** One plain sentence about what happened. */
  const message = useMemo(() => {
    if (phase === 'idle') {
      return willNeverMeet ? t('collisions.messages.neverMeet') : null;
    }
    if (!event) {
      return outcome === 'no-contact' ? t('collisions.messages.noContact') : null;
    }
    const lostPercent =
      event.energyBefore > 0 ? (event.energyLost / event.energyBefore) * 100 : 0;

    if (event.stuck) {
      return t('collisions.messages.stuck', {
        direction: directionOf(event.aAfter),
        speed: friendly(Math.abs(event.aAfter)),
        percent: Math.round(lostPercent),
      });
    }

    const intro = t('collisions.messages.bouncedIntro', {
      nameA: nameOf(baseA.id),
      directionA: directionOf(event.aAfter),
      speedA: friendly(Math.abs(event.aAfter)),
      nameB: nameOf(baseB.id),
      directionB: directionOf(event.bAfter),
      speedB: friendly(Math.abs(event.bAfter)),
    });

    return lostPercent < 0.5
      ? t('collisions.messages.bouncedLossless', { intro })
      : t('collisions.messages.bouncedLossy', { intro, percent: Math.round(lostPercent) });
  }, [phase, event, outcome, willNeverMeet, baseA.id, baseB.id, t, nameOf, directionOf]);

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
          <Text style={styles.badgeText}>{t(`collisions.kinds.${kind}`)}</Text>
          <Text style={styles.badgeDim}>
            {kind === 'realistic'
              ? t('collisions.badge.bounciness', { value: bounciness.toFixed(2) })
              : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        <LevelBlurb module="collisions" />

        <Readout stats={liveStats} details={liveDetails} message={message} />

        <Card title={t('collisions.cards.kind')}>
          <Segmented<CollisionKind>
            options={KIND_IDS.map((id) => ({ value: id, label: t(`collisions.kinds.${id}`) }))}
            value={kind}
            onChange={setKind}
            disabled={running}
            tint={kind === 'sticky' ? colors.amber : colors.accent}
          />
          <Text style={styles.blurb}>{t(`collisions.kindBlurbs.${kind}`)}</Text>
          {kind === 'realistic' ? (
            <View style={styles.bounceSlider}>
              <NumberField
                label={t('collisions.sliders.bounciness')}
                value={bounciness}
                min={0}
                max={1}
                decimals={2}
                disabled={running}
                onCommit={setBounciness}
                hint={t('collisions.sliders.bouncinessHint')}
              />
            </View>
          ) : null}
        </Card>

        <ObjectCard
          title={t('collisions.cards.leftObject')}
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
          title={t('collisions.cards.rightObject')}
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

        <Card title={t('common.playback')}>
          <Segmented
            options={SPEEDS}
            value={timeScale}
            onChange={setTimeScale}
            compact
            disabled={running}
          />
        </Card>

        <FormulaPanel module="collisions" />

        <Text style={styles.credits}>{t('collisions.credits')}</Text>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          label={running ? t('common.running') : t('common.run')}
          icon={running ? undefined : '▶'}
          onPress={start}
          disabled={running}
          flex={2}
        />
        <Button label={t('common.reset')} variant="ghost" onPress={reset} flex={1} />
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
  const { t } = useTranslation();
  const comparisonKey = speedComparisonKey(velocity);
  return (
    <Card title={title} accessory={comparisonKey ? t(comparisonKey) : undefined}>
      <PresetPicker value={presetId} onChange={onPreset} disabled={disabled} />
      <View style={styles.objectSliders}>
        <NumberField
          label={t('collisions.sliders.mass')}
          value={mass}
          min={LIMITS.massMin}
          max={LIMITS.massMax}
          unit="kg"
          decimals={4}
          disabled={disabled}
          onCommit={onMass}
        />
        <NumberField
          label={t('collisions.sliders.startingSpeed')}
          value={velocity}
          min={-15}
          max={15}
          unit="m/s"
          decimals={1}
          disabled={disabled}
          onCommit={onVelocity}
          hint={
            velocity === 0
              ? t('collisions.sliders.sittingStill')
              : t('collisions.sliders.movingAt', {
                  direction: t(`directions.${directionKey(velocity)}`),
                  speed: friendly(Math.abs(velocity)),
                })
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
