import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PresetPicker } from '../../components/sim/PresetPicker';
import { ResultPanel } from '../../components/sim/ResultPanel';
import { Scene } from '../../components/sim/Scene';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Segmented } from '../../components/ui/Segmented';
import { Toggle } from '../../components/ui/Toggle';
import { ValueSlider } from '../../components/ui/ValueSlider';
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
  SHAPE_LABELS,
  type ObjectPreset,
  type ShapeId,
} from '../../lib/physics/presets';
import { analyticBounds, type SimParams, type SimResult } from '../../lib/physics/simulation';
import { colors, radius, scenes, spacing } from '../../theme';
import { useDetailMode } from '../../context/DetailMode';
import { friendly, friendlyTime, precise, speedComparison } from '../../lib/format';

/** Playback speed choices. A feather on a long fall genuinely needs the 4x. */
const SPEEDS = [
  { value: '0.25', label: '¼×' },
  { value: '1', label: '1×' },
  { value: '4', label: '4×' },
];

export default function DropSimulator() {
  const insets = useSafeAreaInsets();

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

  const runLabel = speed > 0 ? 'Launch' : 'Drop';

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
        label: `${base.label} · ${result.totalTime.toFixed(2)} s`,
      });
    }
  }, [result, frame.path, base.label]);

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
        label: 'Speed',
        value: displayFrame.speed,
        unit: 'm/s',
        fill: displayFrame.speed / speedReference,
        showTrend: running,
        caption: speedComparison(displayFrame.speed) ?? undefined,
      },
      {
        key: 'height',
        label: 'Height left',
        value: height,
        unit: 'm',
        fill: height / Math.max(bounds.maxY, 1e-6),
        tone: colors.blue,
      },
      {
        key: 'time',
        label: 'Time',
        value: displayFrame.t,
        unit: 's',
        format: friendlyTime,
        tone: colors.textMuted,
      },
    ];
  }, [displayFrame, speedReference, bounds.maxY, running]);

  /** Raw figures — only rendered when detailed mode is on. */
  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    return [
      { label: 'Time  t', value: precise(displayFrame.t, 4), unit: 's' },
      { label: 'Height  y', value: precise(displayFrame.y, 4), unit: 'm' },
      { label: 'Horizontal  x', value: precise(displayFrame.x, 4), unit: 'm' },
      { label: 'Speed  |v|', value: precise(displayFrame.speed, 4), unit: 'm/s' },
      { label: 'Vertical  vy', value: precise(displayFrame.vy, 4), unit: 'm/s' },
      { label: 'Horizontal  vx', value: precise(displayFrame.vx, 4), unit: 'm/s' },
      { label: 'Gravity  g', value: precise(env.gravity, 2), unit: 'm/s²' },
      {
        label: 'Air density  ρ',
        value: airResistance ? precise(env.airDensity, 3) : '0',
        unit: 'kg/m³',
      },
      { label: 'Drag coefficient  Cd', value: precise(dragCoefficient, 2), unit: '' },
      { label: 'Cross-section  A', value: precise(area, 5), unit: 'm²' },
      {
        label: 'Terminal velocity  v∞',
        value: Number.isFinite(vTerminal) ? precise(vTerminal, 3) : '∞',
        unit: Number.isFinite(vTerminal) ? 'm/s' : '',
      },
    ];
  }, [detailed, displayFrame, env, airResistance, dragCoefficient, area, vTerminal]);

  /** One plain sentence describing what just happened. */
  const outcomeMessage = useMemo(() => {
    if (!result) return null;
    if (result.outcome === 'floating') return 'Nothing is pulling on it, so it just floats.';
    if (result.outcome === 'boundary') return 'It drifted until it reached the wall.';
    if (result.outcome === 'timeout') return 'Still falling when the timer ran out.';
    const t = friendlyTime(result.totalTime);
    const v = friendly(result.impactSpeed);
    const near =
      Number.isFinite(result.terminalVelocity) &&
      result.impactSpeed > result.terminalVelocity * 0.98;
    return near
      ? `Landed after ${t} seconds at ${v} m/s — as fast as the air will let it fall.`
      : `Landed after ${t} seconds, hitting the ground at ${v} m/s.`;
  }, [result]);

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
          <Text style={styles.badgeText}>{env.label}</Text>
          <Text style={styles.badgeDim}>g = {env.gravity.toFixed(2)} m/s²</Text>
          {env.airDensity > 0 && airResistance ? (
            <Text style={styles.badgeDim}>· air</Text>
          ) : (
            <Text style={styles.badgeDim}>· vacuum</Text>
          )}
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
        {showLiveData ? (
          <Readout stats={liveStats} details={liveDetails} message={outcomeMessage} />
        ) : null}

        <Card title="Object" accessory={fmtTerminal(vTerminal)}>
          <PresetPicker value={presetId} onChange={applyPreset} disabled={running} />
          <View style={styles.blurbRow}>
            <Text style={styles.blurb}>{base.blurb}</Text>
            {modified ? (
              <Pressable onPress={() => applyPreset(base)} disabled={running}>
                <Text style={styles.restore}>Restore</Text>
              </Pressable>
            ) : null}
          </View>

          {base.editable ? (
            <View style={styles.customBlock}>
              <Text style={styles.subLabel}>Shape</Text>
              <Segmented<ShapeId>
                compact
                options={(['circle', 'square', 'disc'] as ShapeId[]).map((s) => ({
                  value: s,
                  label: SHAPE_LABELS[s],
                }))}
                value={shape}
                onChange={(s) => {
                  setShape(s);
                  setDragCoefficient(SHAPE_DRAG[s]);
                }}
              />
              <View style={styles.customSliders}>
                <ValueSlider
                  label="Drag coefficient"
                  value={dragCoefficient}
                  min={0.04}
                  max={3}
                  precision={2}
                  disabled={running}
                  onChange={setDragCoefficient}
                />
                <ValueSlider
                  label="Cross-section"
                  value={area}
                  min={0.0001}
                  max={1}
                  unit="m²"
                  precision={4}
                  logarithmic
                  disabled={running}
                  onChange={setArea}
                />
              </View>
            </View>
          ) : null}
        </Card>

        <Card title="Release">
          <ValueSlider
            label="Mass"
            value={mass}
            min={LIMITS.massMin}
            max={LIMITS.massMax}
            unit="kg"
            precision={2}
            logarithmic
            disabled={running}
            onChange={setMass}
            hint={
              airResistance && env.airDensity > 0
                ? undefined
                : 'No air — mass has no effect on the fall'
            }
          />
          <ValueSlider
            label="Drop height"
            value={dropHeight}
            min={LIMITS.heightMin}
            max={LIMITS.heightMax}
            unit="m"
            precision={1}
            disabled={running}
            onChange={setDropHeight}
          />
          <ValueSlider
            label="Initial velocity"
            value={speed}
            min={LIMITS.velocityMin}
            max={LIMITS.velocityMax}
            unit="m/s"
            precision={1}
            disabled={running}
            onChange={setSpeed}
          />
          <ValueSlider
            label="Launch angle"
            value={angleDeg}
            min={LIMITS.angleMin}
            max={LIMITS.angleMax}
            unit="°"
            step={1}
            precision={0}
            disabled={running || angleDisabled}
            onChange={setAngleDeg}
            hint={
              angleDisabled
                ? 'Set an initial velocity to aim'
                : '0° throws flat · 90° straight up'
            }
          />
        </Card>

        <Card title="Environment" accessory={env.note}>
          <Segmented<EnvironmentId>
            options={ENVIRONMENT_ORDER.map((id) => ({
              value: id,
              label: ENVIRONMENTS[id].label,
            }))}
            value={environmentId}
            onChange={setEnvironmentId}
            disabled={running}
            tint={palette.accent}
          />

          <View style={styles.toggles}>
            <Toggle
              label="Air resistance"
              description={
                env.airDensity > 0
                  ? `Quadratic drag at ρ = ${env.airDensity} kg/m³`
                  : `${env.label} is a vacuum — always off`
              }
              value={airResistance && env.airDensity > 0}
              disabled={running || env.airDensity === 0}
              onChange={setAirResistance}
            />
            <View style={styles.hr} />
            <Toggle
              label="Live data"
              description="Speed, height and time while the run is going"
              value={showLiveData}
              onChange={setShowLiveData}
            />
            <View style={styles.hr} />
            <Toggle
              label="Ghost of last run"
              description="Keep the previous trajectory on screen to compare"
              value={showGhost}
              onChange={setShowGhost}
            />
          </View>

          <View style={styles.speedRow}>
            <Text style={styles.subLabel}>Playback</Text>
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

        <Text style={styles.credits}>
          Motion is integrated with RK4 at a fixed 1/240 s step. With air off, the closed-form
          constant-acceleration solution is used instead — which is why every object lands
          together in a vacuum, whatever its mass.
        </Text>
      </ScrollView>

      {/* ------------------------------------------------------- actions -- */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Button
          label={running ? 'Running…' : runLabel}
          icon={running ? undefined : speed > 0 ? '▲' : '▼'}
          onPress={start}
          disabled={running}
          flex={2}
        />
        <Button label="Reset" variant="ghost" onPress={handleReset} flex={1} />
      </View>
    </View>
  );
}

function fmtTerminal(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return 'no drag';
  return `v∞ ${v < 10 ? v.toFixed(2) : v.toFixed(1)} m/s`;
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
