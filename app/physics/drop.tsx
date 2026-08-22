import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import * as Haptics from 'expo-haptics';

import { Readout, type DetailRow, type Stat } from '../../components/readout/Readout';
import { FormulaPanel } from '../../components/sim/FormulaPanel';
import { LevelBlurb } from '../../components/sim/LevelBlurb';
import { PresetPicker } from '../../components/sim/PresetPicker';
import { ResultPanel } from '../../components/sim/ResultPanel';
import { Scene } from '../../components/sim/Scene';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Segmented';
import { Toggle } from '../../components/ui/Toggle';
import { NumberField } from '../../components/ui/NumberField';
import { useImpactSound } from '../../hooks/useImpactSound';
import { useSimulation } from '../../hooks/useSimulation';
import {
  ENVIRONMENTS,
  ENVIRONMENT_ORDER,
  LIMITS,
  type EnvironmentId,
} from '../../lib/physics/constants';
import { buildDragModel, terminalVelocity } from '../../lib/physics/drag';
import { resolveLaunch } from '../../lib/physics/kinematics';
import {
  PRESETS_BY_ID,
  SHAPE_DRAG,
  SHAPE_IDS,
  type ObjectPreset,
  type ShapeId,
} from '../../lib/physics/presets';
import { analyticBounds, type SimParams, type SimResult } from '../../lib/physics/simulation';
import { colors, radius, scenes, spacing } from '../../theme';
import { useDetailMode } from '../../context/DetailMode';
import { useDifficulty } from '../../context/Difficulty';
import { showsExtraQuantities, usesPreciseTerms } from '../../lib/difficulty';
import { friendly, friendlyTime, precise, speedComparisonKey } from '../../lib/format';

/** Playback speed choices. A feather on a long fall genuinely needs the 4x. */
const SPEEDS = [
  { value: '0.25', label: '¼×' },
  { value: '1', label: '1×' },
  { value: '4', label: '4×' },
];

export default function DropSimulator() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // ------------------------------------------------------------ parameters
  const [presetId, setPresetId] = useState('ball');
  const base = PRESETS_BY_ID[presetId];

  const [mass, setMass] = useState(base.mass);
  const [dragCoefficient, setDragCoefficient] = useState(base.dragCoefficient);
  const [area, setArea] = useState(base.area);
  const [shape, setShape] = useState<ShapeId>(base.shape);

  const [dropHeight, setDropHeight] = useState(10);
  const [speed, setSpeed] = useState(0);
  const [angleDeg, setAngleDeg] = useState(45);

  const [environmentId, setEnvironmentId] = useState<EnvironmentId>('earth');
  const [airResistance, setAirResistance] = useState(true);
  const [showLiveData, setShowLiveData] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [timeScale, setTimeScale] = useState('1');

  const env = ENVIRONMENTS[environmentId];
  const palette = scenes[environmentId];

  // The object as the simulation and the renderer see it: preset defaults with
  // whatever the user has since overridden.
  const preset: ObjectPreset = useMemo(
    () => ({ ...base, mass, dragCoefficient, area, shape }),
    [base, mass, dragCoefficient, area, shape]
  );

  const params: SimParams = useMemo(
    () => ({
      mass,
      dragCoefficient,
      area,
      dropHeight,
      speed,
      angleDeg,
      environmentId,
      airResistance,
    }),
    [mass, dragCoefficient, area, dropHeight, speed, angleDeg, environmentId, airResistance]
  );

  const applyPreset = useCallback((p: ObjectPreset) => {
    setPresetId(p.id);
    setMass(p.mass);
    setDragCoefficient(p.dragCoefficient);
    setArea(p.area);
    setShape(p.shape);
  }, []);

  const modified =
    Math.abs(mass - base.mass) > 1e-9 ||
    Math.abs(dragCoefficient - base.dragCoefficient) > 1e-9 ||
    Math.abs(area - base.area) > 1e-12;

  // ------------------------------------------------------------ simulation
  const playImpact = useImpactSound();

  /** The path of the previous run, so two drops can be compared side by side. */
  const [ghost, setGhost] = useState<{ path: { x: number; y: number }[]; label: string } | null>(
    null
  );

  const onImpact = useCallback(
    (result: SimResult, profile: Parameters<typeof playImpact>[1]) => {
      playImpact(preset.material, profile);
      if (Platform.OS !== 'web') {
        // Match the haptic to the hit: a feather should barely register.
        const style =
          profile.shake > 6
            ? Haptics.ImpactFeedbackStyle.Heavy
            : profile.shake > 2
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light;
        Haptics.impactAsync(style).catch(() => {});
      }
    },
    [playImpact, preset.material]
  );

  const { phase, frame, result, start, reset, setProjector } = useSimulation({
    params,
    speedMultiplier: Number(timeScale),
    onImpact,
  });

  const running = phase === 'running' || phase === 'settling';
  const bounds = useMemo(() => analyticBounds(params), [params]);

  // Before a run there is no simulation state, so the canvas is given a
  // stand-in frame that parks the object at the release point. This is what
  // makes dragging the height slider move the object live.
  const displayFrame = useMemo(
    () => (phase === 'idle' ? { ...frame, x: 0, y: dropHeight, path: [] } : frame),
    [phase, frame, dropHeight]
  );

  // Terminal velocity for the current setup, shown live so the effect of every
  // slider on drag is visible before anything is dropped.
  const vTerminal = useMemo(
    () => terminalVelocity(buildDragModel(params, env, airResistance)),
    [params, env, airResistance]
  );

  const runLabel = speed > 0 ? t('common.launch') : t('common.drop');

  // Bank each finished run so the next one can be compared against it. Doing
  // this when the run ends (rather than when the next one starts) means the
  // trail survives the reset below.
  const banked = useRef<SimResult | null>(null);
  useEffect(() => {
    if (!result || banked.current === result) return;
    banked.current = result;
    if (frame.path.length > 2) {
      setGhost({
        path: frame.path.slice(),
        label: `${t(`presets.${base.id}.label`)} · ${result.totalTime.toFixed(2)} s`,
      });
    }
  }, [result, frame.path, base.id, t]);

  /**
   * Editing anything after a run returns the object to the release point and
   * clears the readouts. Leaving a finished run on screen while its inputs
   * change would show numbers that no longer describe the setup.
   */
  useEffect(() => {
    if (phase === 'done') reset();
    // `phase` is deliberately not a dependency: this must fire on parameter
    // changes only, not on the transition into 'done'.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleReset = useCallback(() => {
    reset();
    setGhost(null);
    banked.current = null;
  }, [reset]);

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

  const [panelWidth, setPanelWidth] = useState(0);

  const angleDisabled = speed === 0;

  // ---------------------------------------------------------------- readout
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);

  /** Which way it is currently travelling — shown once terms turn precise. */
  const directionCaption = useCallback(
    (verticalVelocity: number) => {
      if (Math.abs(verticalVelocity) < 0.01) return '';
      return verticalVelocity < 0 ? t('drop.stats.down') : t('drop.stats.up');
    },
    [t]
  );

  /** Resolves the everyday-speed comparison key, or nothing when too slow. */
  const comparisonCaption = useCallback(
    (speedValue: number) => {
      const key = speedComparisonKey(speedValue);
      return key ? t(key) : undefined;
    },
    [t]
  );

  /**
   * The bar reads against the fastest this object could possibly be going: the
   * drag-free impact speed. With air resistance on it visibly stops short of
   * full, which is the whole point of the terminal-velocity idea.
   */
  const speedReference = useMemo(() => {
    const v = resolveLaunch(speed, angleDeg);
    return Math.max(
      Math.hypot(v.x, Math.sqrt(Math.max(v.y * v.y + 2 * env.gravity * dropHeight, 0))),
      speed,
      1
    );
  }, [speed, angleDeg, env.gravity, dropHeight]);

  const liveStats: Stat[] = useMemo(() => {
    const height = Math.max(displayFrame.y, 0);
    return [
      {
        key: 'speed',
        label: precise_ ? t('drop.stats.velocity') : t('drop.stats.speed'),
        value: displayFrame.speed,
        unit: 'm/s',
        fill: displayFrame.speed / speedReference,
        showTrend: running,
        caption: precise_
          ? [directionCaption(displayFrame.vy), comparisonCaption(displayFrame.speed)]
              .filter(Boolean)
              .join(' · ')
          : comparisonCaption(displayFrame.speed),
      },
      {
        key: 'height',
        label: t('drop.stats.heightLeft'),
        value: height,
        unit: 'm',
        fill: height / Math.max(bounds.maxY, 1e-6),
        tone: colors.blue,
      },
      {
        key: 'time',
        label: t('drop.stats.time'),
        value: displayFrame.t,
        unit: 's',
        format: friendlyTime,
        tone: colors.textMuted,
      },
    ];
  }, [displayFrame, speedReference, bounds.maxY, running, t, comparisonCaption, precise_, directionCaption]);

  /** Raw figures — only rendered when detailed mode is on. */
  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    return [
      { label: t('details.time'), value: precise(displayFrame.t, 4), unit: 's' },
      { label: t('details.height'), value: precise(displayFrame.y, 4), unit: 'm' },
      { label: t('details.horizontalPosition'), value: precise(displayFrame.x, 4), unit: 'm' },
      { label: t('details.speed'), value: precise(displayFrame.speed, 4), unit: 'm/s' },
      { label: t('details.verticalVelocity'), value: precise(displayFrame.vy, 4), unit: 'm/s' },
      { label: t('details.horizontalVelocity'), value: precise(displayFrame.vx, 4), unit: 'm/s' },
      { label: t('details.gravity'), value: precise(env.gravity, 2), unit: 'm/s²' },
      {
        label: t('details.airDensity'),
        value: airResistance ? precise(env.airDensity, 3) : '0',
        unit: 'kg/m³',
      },
      { label: t('details.dragCoefficient'), value: precise(dragCoefficient, 2), unit: '' },
      { label: t('details.crossSection'), value: precise(area, 5), unit: 'm²' },
      ...(showsExtraQuantities(level)
        ? [
            {
              label: t('details.momentum'),
              value: precise(mass * displayFrame.speed, 4),
              unit: 'kg·m/s',
            },
            {
              label: t('details.kineticEnergy'),
              value: precise(0.5 * mass * displayFrame.speed ** 2, 4),
              unit: 'J',
            },
          ]
        : []),
      {
        label: t('details.terminalVelocity'),
        value: Number.isFinite(vTerminal) ? precise(vTerminal, 3) : '∞',
        unit: Number.isFinite(vTerminal) ? 'm/s' : '',
      },
    ];
  }, [detailed, displayFrame, env, airResistance, dragCoefficient, area, vTerminal, t, level, mass]);

  /** One plain sentence describing what just happened. */
  const outcomeMessage = useMemo(() => {
    if (!result) return null;
    if (result.outcome === 'floating') return t('drop.messages.floating');
    if (result.outcome === 'boundary') return t('drop.messages.boundary');
    if (result.outcome === 'timeout') return t('drop.messages.timeout');
    const values = {
      time: friendlyTime(result.totalTime),
      speed: friendly(result.impactSpeed),
    };
    const atTerminal =
      Number.isFinite(result.terminalVelocity) &&
      result.impactSpeed > result.terminalVelocity * 0.98;
    return t(atTerminal ? 'drop.messages.landedTerminal' : 'drop.messages.landed', values);
  }, [result, t]);

  return (
    <View style={styles.screen}>
      {/* ------------------------------------------------------- canvas -- */}
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <Scene
            width={canvas.width}
            height={canvas.height}
            environmentId={environmentId}
            preset={preset}
            bounds={bounds}
            frame={displayFrame}
            phase={phase}
            ghostPath={showGhost && !result ? ghost?.path : null}
            ghostLabel={showGhost && !result ? (ghost?.label ?? null) : null}
            onProjector={setProjector}
          />
        ) : null}

        <View style={[styles.canvasBadge, { pointerEvents: 'none' }]}>
          <View style={[styles.badgeDot, { backgroundColor: palette.accent }]} />
          <Text style={styles.badgeText}>{t(`environments.${env.id}.label`)}</Text>
          <Text style={styles.badgeDim}>g = {env.gravity.toFixed(2)} m/s²</Text>
          <Text style={styles.badgeDim}>
            ·{' '}
            {env.airDensity > 0 && airResistance
              ? t('drop.badge.air')
              : t('drop.badge.vacuum')}
          </Text>
        </View>

      </View>

      {/* ------------------------------------------------------ controls -- */}
      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
        // Chart width = screen, less the scroll padding, the card padding and
        // the card's 1px borders.
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width - spacing.md * 4 - 2)}
      >
        <LevelBlurb module="drop" />

        {showLiveData ? (
          <Readout stats={liveStats} details={liveDetails} message={outcomeMessage} />
        ) : null}

        <Card title={t('drop.cards.object')} accessory={fmtTerminal(vTerminal, t)}>
          <PresetPicker value={presetId} onChange={applyPreset} disabled={running} />
          <View style={styles.blurbRow}>
            <Text style={styles.blurb}>{t(`presets.${base.id}.blurb`)}</Text>
            {modified ? (
              <Pressable onPress={() => applyPreset(base)} disabled={running}>
                <Text style={styles.restore}>{t('common.restore')}</Text>
              </Pressable>
            ) : null}
          </View>

          {base.editable ? (
            <View style={styles.customBlock}>
              <Text style={styles.subLabel}>{t('drop.shape')}</Text>
              <Segmented<ShapeId>
                compact
                options={SHAPE_IDS.map((id) => ({ value: id, label: t(`shapes.${id}`) }))}
                value={shape}
                onChange={(s) => {
                  setShape(s);
                  setDragCoefficient(SHAPE_DRAG[s]);
                }}
              />
              <View style={styles.customSliders}>
                <NumberField
                  label={t('drop.sliders.dragCoefficient')}
                  value={dragCoefficient}
                  min={0.04}
                  max={3}
                  decimals={2}
                  disabled={running}
                  onCommit={setDragCoefficient}
                />
                <NumberField
                  label={t('drop.sliders.crossSection')}
                  value={area}
                  min={0.0001}
                  max={1}
                  unit="m²"
                  decimals={4}
                  disabled={running}
                  onCommit={setArea}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Card title={t('drop.cards.release')}>
          <NumberField
            label={t('drop.sliders.mass')}
            value={mass}
            min={LIMITS.massMin}
            max={LIMITS.massMax}
            unit="kg"
            decimals={4}
            disabled={running}
            onCommit={setMass}
            hint={
              airResistance && env.airDensity > 0 ? undefined : t('drop.hints.noAirMass')
            }
          />
          <NumberField
            label={t('drop.sliders.dropHeight')}
            value={dropHeight}
            min={LIMITS.heightMin}
            max={LIMITS.heightMax}
            unit="m"
            decimals={1}
            disabled={running}
            onCommit={setDropHeight}
          />
          <NumberField
            label={t('drop.sliders.initialVelocity')}
            value={speed}
            min={LIMITS.velocityMin}
            max={LIMITS.velocityMax}
            unit="m/s"
            decimals={1}
            disabled={running}
            onCommit={setSpeed}
          />
          <NumberField
            label={t('drop.sliders.launchAngle')}
            value={angleDeg}
            min={LIMITS.angleMin}
            max={LIMITS.angleMax}
            unit="°"
            decimals={0}
            disabled={running || angleDisabled}
            onCommit={setAngleDeg}
            hint={angleDisabled ? t('drop.hints.needVelocity') : t('drop.hints.angle')}
          />
        </Card>

        <Card title={t('drop.cards.environment')} accessory={t(`environments.${env.id}.note`)}>
          <Segmented<EnvironmentId>
            options={ENVIRONMENT_ORDER.map((id) => ({
              value: id,
              label: t(`environments.${id}.label`),
            }))}
            value={environmentId}
            onChange={setEnvironmentId}
            disabled={running}
            tint={palette.accent}
          />

          <View style={styles.toggles}>
            <Toggle
              label={t('drop.toggles.airResistance')}
              description={
                env.airDensity > 0
                  ? t('drop.toggles.airResistanceOn', { density: env.airDensity })
                  : t('drop.toggles.airResistanceVacuum', {
                      environment: t(`environments.${env.id}.label`),
                    })
              }
              value={airResistance && env.airDensity > 0}
              disabled={running || env.airDensity === 0}
              onChange={setAirResistance}
            />
            <View style={styles.hr} />
            <Toggle
              label={t('drop.toggles.liveData')}
              description={t('drop.toggles.liveDataDescription')}
              value={showLiveData}
              onChange={setShowLiveData}
            />
            <View style={styles.hr} />
            <Toggle
              label={t('drop.toggles.ghost')}
              description={t('drop.toggles.ghostDescription')}
              value={showGhost}
              onChange={setShowGhost}
            />
          </View>

          <View style={styles.speedRow}>
            <Text style={styles.subLabel}>{t('common.playback')}</Text>
            <View style={styles.speedControl}>
              <Segmented
                compact
                options={SPEEDS}
                value={timeScale}
                onChange={setTimeScale}
                disabled={running}
              />
            </View>
          </View>
        </Card>

        {result && panelWidth > 0 ? (
          <ResultPanel
            result={result}
            dropHeight={dropHeight}
            chartWidth={panelWidth}
            airResistance={airResistance && env.airDensity > 0}
          />
        ) : null}

        <FormulaPanel module="drop" />

        <Text style={styles.credits}>{t('drop.credits')}</Text>
      </ScrollView>

      {/* ------------------------------------------------------- actions -- */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          label={running ? t('common.running') : runLabel}
          icon={running ? undefined : speed > 0 ? '▲' : '▼'}
          onPress={start}
          disabled={running}
          flex={2}
        />
        <Button label={t('common.reset')} variant="ghost" onPress={handleReset} flex={1} />
      </View>
    </View>
  );
}

function fmtTerminal(v: number, t: TFunction): string {
  if (!Number.isFinite(v) || v <= 0) return t('drop.terminal.none');
  return t('drop.terminal.value', { value: v < 10 ? v.toFixed(2) : v.toFixed(1) });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  canvas: {
    height: '42%',
    minHeight: 240,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
  },
  canvasBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(8,11,18,0.6)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: radius.pill },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  badgeDim: { color: colors.textFaint, fontSize: 10 },


  controls: { flex: 1 },
  controlsContent: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },

  blurbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  blurb: { color: colors.textFaint, fontSize: 11.5, flex: 1 },
  restore: { color: colors.accent, fontSize: 11.5, fontWeight: '700' },

  customBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
    gap: spacing.sm,
  },
  customSliders: { marginTop: spacing.xs },
  subLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  toggles: { marginTop: spacing.md },
  hr: { height: 1, backgroundColor: colors.strokeSoft, marginVertical: 2 },

  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },
  speedControl: { width: 168 },

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
