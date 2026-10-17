'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from '../../../components/dom/index';
import { Readout, type DetailRow, type Stat } from '../../../components/readout/Readout';
import { EffortBars } from '../../../components/sim/EffortBars';
import { FormulaPanel } from '../../../components/sim/FormulaPanel';
import { IntroPanel } from '../../../components/sim/IntroPanel';
import { LevelBlurb } from '../../../components/sim/LevelBlurb';
import { MachineBanner } from '../../../components/sim/MachineBanner';
import { InclineScene, LeverScene, PulleyScene } from '../../../components/sim/MachineScenes';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { NumberField } from '../../../components/ui/NumberField';
import { Segmented } from '../../../components/ui/Segmented';
import { Toggle } from '../../../components/ui/Toggle';
import { useDetailMode } from '../../../context/DetailMode';
import { useDifficulty } from '../../../context/Difficulty';
import { useDismissiblePanel } from '../../../hooks/useDismissiblePanel';
import { useMachineSim } from '../../../hooks/useMachineSim';
import { useMachineSound } from '../../../hooks/useMachineSound';
import { formulaDisplayFor, usesPreciseTerms } from '../../../lib/difficulty';
import { friendly, precise } from '../../../lib/format';
import {
  buildModel,
  type InclineState,
  type LeverState,
  type MachineModel,
  type PulleyState,
} from '../../../lib/machines/model';
import {
  HAND_PACE,
  MAX_FALL_SPEED,
  motionStatus,
  type MotionEvent,
} from '../../../lib/machines/motion';
import {
  MACHINE_LIMITS,
  MACHINE_ORDER,
  PULLEY_TRAVEL,
  maxRampHeight,
  roundUpEffort,
  type MachineId,
} from '../../../lib/physics/machines';
import { useSoundEnabled } from '../../../lib/soundSettings';
import { colors, radius, spacing } from '../../../theme';

const INITIAL = {
  lever: { mass: 20, pivot: 1, effort: 80 } satisfies LeverState,
  incline: { mass: 20, length: 5, height: 1, effort: 60 } satisfies InclineState,
  pulley: { mass: 20, pulleys: 1, effort: 120 } satisfies PulleyState,
};

/** 3 → "3", 2.5 → "2.5", 0.333 → "0.33". */
function formatRatio(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v - Math.round(v)) < 0.005) return String(Math.round(v));
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
}

/** A force with at most one decimal and no trailing zero: "65.4", "100". */
function formatForce(v: number): string {
  return String(Number(v.toFixed(1)));
}

export default function MachinesSimulator() {
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);
  const isPro = level === 'pro';
  const [soundOn, setSoundOn] = useSoundEnabled();

  const intro = useDismissiblePanel('machines-intro');
  const tips = {
    lever: useDismissiblePanel('machines-tip-lever'),
    incline: useDismissiblePanel('machines-tip-incline'),
    pulley: useDismissiblePanel('machines-tip-pulley'),
  };

  // ------------------------------------------------------------ parameters
  const [mode, setMode] = useState<MachineId>('lever');
  const [lever, setLever] = useState<LeverState>(INITIAL.lever);
  const [incline, setIncline] = useState<InclineState>(INITIAL.incline);
  const [pulley, setPulley] = useState<PulleyState>(INITIAL.pulley);

  const model: MachineModel = useMemo(
    () => buildModel(mode, { lever, incline, pulley }),
    [mode, lever, incline, pulley]
  );

  // ----------------------------------------------------------------- sound
  const sound = useMachineSound();
  const onEvent = useCallback(
    (event: MotionEvent, lane: number) => {
      if (lane !== 0) return;
      sound.thud(event.type === 'thud' ? event.strength : 0.25);
    },
    [sound]
  );

  const sim = useMachineSim(model.lanes, { onEvent });
  const main = sim.motions[0] ?? { progress: 0, velocity: 0 };
  const compare = sim.motions[1] ?? { progress: 0, velocity: 0 };
  const status = motionStatus(main, { running: sim.running, enough: model.enough }, sim.started);

  useEffect(() => {
    const lane = model.lanes[0];
    let speed = 0;
    if (status === 'lifting') speed = (Math.abs(main.velocity) * lane.handTravel) / HAND_PACE;
    else if (status === 'falling') speed = (Math.abs(main.velocity) * lane.pathLength) / MAX_FALL_SPEED;
    sound.setMotion(speed > 0.02 ? mode : null, speed);
  }, [status, main.velocity, model.lanes, mode, sound]);

  // The effort falling short makes the force arrow and the bars shake again.
  const [shakeKey, setShakeKey] = useState(0);
  const comparisonFails = mode === 'incline' && sim.running && !model.lanes[1]?.enough;
  const shouldShake = status === 'blocked' || status === 'falling' || comparisonFails;
  const wasShaking = useRef(false);
  useEffect(() => {
    if (shouldShake && !wasShaking.current) setShakeKey((k) => k + 1);
    wasShaking.current = shouldShake;
  }, [shouldShake]);

  const changeMode = (next: MachineId) => {
    if (next === mode) return;
    setMode(next);
    sim.reset();
    wasShaking.current = false;
    setShakeKey(0);
  };

  const toggleRun = () => {
    sound.unlock();
    if (sim.running) sim.pause();
    else sim.start();
  };

  const reset = () => {
    sim.reset();
    wasShaking.current = false;
    setShakeKey(0);
  };

  // ---------------------------------------------------------------- layout
  const [scene, setScene] = useState({ width: 0, height: 0 });
  const onSceneLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setScene((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }
    );
  }, []);

  // ------------------------------------------------------------------ words
  const ma = model.mechanicalAdvantage;
  const kind: 'easier' | 'same' | 'harder' = ma > 1.005 ? 'easier' : ma < 0.995 ? 'harder' : 'same';
  const maText = formatRatio(ma);
  const factor = formatRatio(kind === 'harder' ? 1 / ma : ma);
  const needed = formatForce(roundUpEffort(model.required));
  const tone = kind === 'easier' ? colors.accent : kind === 'same' ? colors.amber : colors.rose;

  const headline = (() => {
    if (level === 'beginner') {
      if (model.mode === 'pulley' && model.pulleys === 1) return t('pulley.banner.single');
      return t(`machines.banner.beginner.${kind}`, { n: factor });
    }
    if (level === 'intermediate') return t('machines.banner.intermediate', { n: maText });
    switch (model.mode) {
      case 'lever':
        return t('lever.banner.pro', {
          effortArm: precise(model.analysis.effortArm, 2),
          loadArm: precise(model.analysis.loadArm, 2),
          n: precise(ma, 2),
        });
      case 'incline':
        return t('incline.banner.pro', {
          length: precise(model.length, 2),
          height: precise(model.height, 2),
          n: precise(ma, 2),
        });
      case 'pulley':
        return t('pulley.banner.pro', { n: model.pulleys });
    }
  })();

  const verdict = model.enough
    ? t('machines.verdict.enough', { effort: formatForce(model.effort) })
    : t('machines.verdict.notEnough', { effort: formatForce(model.effort), needed });

  const tradeoff = t(`machines.tradeoff.${kind}`, { n: factor });
  const distances = t(`${model.mode}.distance`, {
    effort: friendly(model.work.effortDistance),
    load: friendly(model.work.loadDistance),
  });

  const badge = `×${maText}`;
  const badgeNote =
    level === 'beginner' ? t(`machines.badge.${kind}`) : t('machines.badge.advantage');

  // --------------------------------------------------------------- readout
  const stats: Stat[] = useMemo(() => {
    if (!precise_) {
      return [
        {
          key: 'easier',
          label: t('machines.stats.easierBy'),
          value: ma,
          unit: '×',
          fill: Math.min(1, ma / 8),
          tone,
          format: formatRatio,
        },
        {
          key: 'effort',
          label: t('machines.stats.effortNeeded'),
          value: model.required,
          unit: 'N',
          fill: Math.min(1, model.required / model.loadForce),
          tone: colors.accent,
          format: (v) => v.toFixed(1),
        },
      ];
    }
    return [
      {
        key: 'ma',
        label: t('machines.stats.ma'),
        value: ma,
        fill: Math.min(1, ma / 8),
        tone,
        format: (v) => (isPro ? precise(v, 2) : formatRatio(v)),
      },
      {
        key: 'effort',
        label: t('machines.stats.effortForce'),
        value: model.required,
        unit: 'N',
        tone: colors.accent,
        format: (v) => v.toFixed(1),
      },
      {
        key: 'load',
        label: t('machines.stats.loadForce'),
        value: model.loadForce,
        unit: 'N',
        tone: colors.amber,
        format: (v) => v.toFixed(1),
      },
    ];
  }, [precise_, isPro, ma, tone, model.required, model.loadForce, t]);

  const details: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const rows: DetailRow[] = [];
    if (model.mode === 'lever') {
      rows.push(
        { label: t('machines.details.loadArm'), value: precise(model.analysis.loadArm, 2), unit: 'm' },
        { label: t('machines.details.effortArm'), value: precise(model.analysis.effortArm, 2), unit: 'm' },
        { label: t('machines.details.loadTorque'), value: precise(model.analysis.loadTorque, 1), unit: 'N·m' },
        { label: t('machines.details.effortTorque'), value: precise(model.analysis.effortTorque, 1), unit: 'N·m' }
      );
    } else if (model.mode === 'incline') {
      rows.push(
        { label: t('machines.details.length'), value: precise(model.length, 2), unit: 'm' },
        { label: t('machines.details.height'), value: precise(model.height, 2), unit: 'm' },
        { label: t('machines.details.angle'), value: precise((model.analysis.angle * 180) / Math.PI, 1), unit: '°' },
        { label: t('machines.details.liftForce'), value: precise(model.analysis.liftForce, 1), unit: 'N' }
      );
    } else {
      rows.push({ label: t('machines.details.segments'), value: String(model.pulleys), unit: '' });
    }
    rows.push(
      { label: t('machines.details.effortDistance'), value: precise(model.work.effortDistance, 2), unit: 'm' },
      { label: t('machines.details.loadDistance'), value: precise(model.work.loadDistance, 2), unit: 'm' },
      { label: t('machines.details.yourEffort'), value: precise(model.effort, 1), unit: 'N' }
    );
    return rows;
  }, [detailed, model, t]);

  const message = t(`machines.status.${status}`);

  // ---------------------------------------------------------------- effort
  const setEffort = (effort: number) => {
    if (mode === 'lever') setLever((s) => ({ ...s, effort }));
    else if (mode === 'incline') setIncline((s) => ({ ...s, effort }));
    else setPulley((s) => ({ ...s, effort }));
  };
  const setMass = (mass: number) => {
    if (mode === 'lever') setLever((s) => ({ ...s, mass }));
    else if (mode === 'incline') setIncline((s) => ({ ...s, mass }));
    else setPulley((s) => ({ ...s, mass }));
  };

  const bars = [
    {
      key: 'hand',
      label: precise_ ? t('machines.bars.byHandTech') : t('machines.bars.byHand'),
      value: model.loadForce,
      tone: colors.amber,
    },
    {
      key: 'machine',
      label: precise_ ? t(`machines.bars.${mode}Tech`) : t(`machines.bars.${mode}`),
      value: model.required,
      tone: colors.accent,
    },
  ];

  const showFormulaNote = formulaDisplayFor(level) !== 'hidden';
  const runLabel = sim.running
    ? t('machines.buttons.pause')
    : status === 'done'
      ? t('machines.buttons.again')
      : sim.started
        ? t('machines.buttons.resume')
        : t(`machines.buttons.start.${mode}`);

  const tip = tips[mode];
  const loadLabel = `${formatForce(model.loadMass)} kg`;
  const effortFieldLabel = t(`${mode}.fields.effort`);

  return (
    <View style={styles.screen}>
      {/* ------------------------------------------------------ the mode -- */}
      <View style={styles.modeBar}>
        <Segmented<MachineId>
          options={MACHINE_ORDER.map((id) => ({ value: id, label: t(`machines.modes.${id}`) }))}
          value={mode}
          onChange={changeMode}
          compact
        />
      </View>

      {/* ------------------------------------------------------- canvas -- */}
      <View style={styles.canvas}>
        <View style={styles.sceneBox} onLayout={onSceneLayout}>
          {scene.width > 0 && model.mode === 'lever' ? (
            <LeverScene
              width={scene.width}
              height={scene.height}
              geometry={model.geometry}
              progress={main.progress}
              loadMass={model.loadMass}
              loadForce={model.loadForce}
              effort={model.effort}
              effortRequired={model.required}
              enough={model.enough}
              shakeKey={shakeKey}
              labels={{
                load: loadLabel,
                loadForce: `${formatForce(model.loadForce)} N`,
                effortForce: `${formatForce(model.effort)} N`,
                loadArm: `${precise(model.analysis.loadArm, 1)} m`,
                effortArm: `${precise(model.analysis.effortArm, 1)} m`,
                pivot: t('lever.scene.pivot'),
              }}
            />
          ) : null}
          {scene.width > 0 && model.mode === 'incline' ? (
            <InclineScene
              width={scene.width}
              height={scene.height}
              length={model.length}
              rise={model.height}
              progress={main.progress}
              liftProgress={compare.progress}
              loadMass={model.loadMass}
              loadForce={model.loadForce}
              effort={model.effort}
              effortRequired={model.required}
              enough={model.enough}
              canLiftStraight={model.analysis.canLiftStraight}
              shakeKey={shakeKey}
              labels={{
                load: loadLabel,
                length: `${precise(model.length, 1)} m`,
                height: `${precise(model.height, 1)} m`,
                push: `${formatForce(model.effort)} N`,
                lift: `${formatForce(model.effort)} N`,
              }}
            />
          ) : null}
          {scene.width > 0 && model.mode === 'pulley' ? (
            <PulleyScene
              width={scene.width}
              height={scene.height}
              pulleys={model.pulleys}
              progress={main.progress}
              travel={PULLEY_TRAVEL}
              loadMass={model.loadMass}
              loadForce={model.loadForce}
              effort={model.effort}
              effortRequired={model.required}
              enough={model.enough}
              shakeKey={shakeKey}
              labels={{
                load: loadLabel,
                loadForce: `${formatForce(model.loadForce)} N`,
                effortForce: `${formatForce(model.effort)} N`,
              }}
            />
          ) : null}

          {/* The mechanical advantage, always in view */}
          <View style={[styles.badge, { pointerEvents: 'none', borderColor: tone + '88' }]}>
            <Text style={[styles.badgeValue, { color: tone }]}>{badge}</Text>
            <Text style={styles.badgeNote}>{badgeNote}</Text>
          </View>
        </View>
      </View>

      {/* ---------------------------------------------------- controls -- */}
      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        {intro.visible ? (
          <IntroPanel
            title={t('machines.intro.title')}
            body={t('machines.intro.body')}
            tip={t('machines.intro.tip')}
            onDismiss={intro.dismiss}
          />
        ) : null}

        <MachineBanner
          badge={badge}
          headline={headline}
          verdict={verdict}
          enough={model.enough}
          tradeoff={tradeoff}
          distances={distances}
          tone={tone}
        />

        <LevelBlurb module={mode} />

        {tip.visible ? (
          <View style={styles.tip}>
            <Text style={styles.tipTitle}>{t('machines.tryThis.title')}</Text>
            <Text style={styles.tipBody}>{t(`machines.tryThis.${mode}`)}</Text>
            <Pressable onPress={tip.dismiss} style={styles.tipDismiss} accessibilityRole="button">
              <Text style={styles.tipDismissText}>{t('common.gotIt')}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ---------------------------------------------- the machine -- */}
        <Card title={t(`machines.cards.${mode}`)}>
          {model.mode === 'lever' ? (
            <>
              <NumberField
                label={t('lever.fields.load')}
                value={lever.mass}
                min={MACHINE_LIMITS.loadMin}
                max={MACHINE_LIMITS.loadMax}
                unit="kg"
                decimals={1}
                hint={!precise_ ? t('machines.fields.loadHint') : undefined}
                onCommit={setMass}
              />
              <NumberField
                label={t('lever.fields.pivot')}
                value={lever.pivot}
                min={MACHINE_LIMITS.pivotMin}
                max={MACHINE_LIMITS.pivotMax}
                unit="m"
                decimals={1}
                hint={t('lever.fields.pivotHint', { total: MACHINE_LIMITS.leverLength })}
                onCommit={(pivot) => setLever((s) => ({ ...s, pivot }))}
              />
            </>
          ) : null}

          {model.mode === 'incline' ? (
            <>
              <NumberField
                label={t('incline.fields.load')}
                value={incline.mass}
                min={MACHINE_LIMITS.loadMin}
                max={MACHINE_LIMITS.loadMax}
                unit="kg"
                decimals={1}
                hint={!precise_ ? t('machines.fields.loadHint') : undefined}
                onCommit={setMass}
              />
              <NumberField
                label={t('incline.fields.length')}
                value={incline.length}
                min={MACHINE_LIMITS.rampLengthMin}
                max={MACHINE_LIMITS.rampLengthMax}
                unit="m"
                decimals={1}
                hint={t('incline.fields.lengthHint')}
                onCommit={(length) =>
                  setIncline((s) => ({ ...s, length, height: Math.min(s.height, maxRampHeight(length)) }))
                }
              />
              <NumberField
                label={t('incline.fields.height')}
                value={model.height}
                min={MACHINE_LIMITS.rampHeightMin}
                max={maxRampHeight(incline.length)}
                unit="m"
                decimals={1}
                hint={t('incline.fields.heightHint')}
                onCommit={(height) => setIncline((s) => ({ ...s, height }))}
              />
            </>
          ) : null}

          {model.mode === 'pulley' ? (
            <>
              <NumberField
                label={t('pulley.fields.load')}
                value={pulley.mass}
                min={MACHINE_LIMITS.loadMin}
                max={MACHINE_LIMITS.loadMax}
                unit="kg"
                decimals={1}
                hint={!precise_ ? t('machines.fields.loadHint') : undefined}
                onCommit={setMass}
              />
              <NumberField
                label={t('pulley.fields.pulleys')}
                value={pulley.pulleys}
                min={MACHINE_LIMITS.pulleysMin}
                max={MACHINE_LIMITS.pulleysMax}
                decimals={0}
                hint={model.pulleys === 1 ? t('pulley.fields.pulleysSingle') : t('pulley.fields.pulleysHint')}
                onCommit={(pulleys) => setPulley((s) => ({ ...s, pulleys }))}
              />
            </>
          ) : null}

          <View style={styles.block}>
            <NumberField
              label={effortFieldLabel}
              value={model.effort}
              min={MACHINE_LIMITS.effortMin}
              max={model.effortMax}
              unit="N"
              decimals={1}
              hint={t('machines.fields.effortHint')}
              onCommit={setEffort}
            />
            <Button
              label={t('machines.buttons.useLeast')}
              variant="ghost"
              onPress={() => setEffort(Math.min(model.effortMax, roundUpEffort(model.required)))}
            />
          </View>

          <View style={styles.block}>
            <Toggle
              label={t('settings.soundLabel')}
              description={t('machines.fields.soundHint')}
              value={soundOn}
              onChange={setSoundOn}
            />
          </View>
        </Card>

        <EffortBars
          title={t('machines.cards.bars')}
          bars={bars}
          effort={model.effort}
          effortLabel={t('machines.bars.yours', { n: formatForce(model.effort) })}
          enough={model.enough}
          shakeKey={shakeKey}
          formatValue={(v) => `${v.toFixed(1)} N`}
        />

        <Readout stats={stats} details={details} message={message} />

        {isPro ? (
          <Card title={t('machines.cards.work')}>
            <Fact
              label={t('machines.work.in')}
              value={`${precise(model.required, 1)} N × ${precise(model.work.effortDistance, 2)} m = ${precise(model.work.input, 1)} J`}
            />
            <Fact
              label={t('machines.work.out')}
              value={`${precise(model.loadForce, 1)} N × ${precise(model.work.loadDistance, 2)} m = ${precise(model.work.output, 1)} J`}
            />
            <View style={styles.equal}>
              <Text style={styles.equalText}>{t('machines.work.equal')}</Text>
            </View>
            <Text style={styles.hint}>{t('machines.work.note')}</Text>
          </Card>
        ) : null}

        <FormulaPanel module={mode} />
        {showFormulaNote ? <Text style={styles.formulaNote}>{t(`${mode}.formulaNote`)}</Text> : null}

        <Text style={styles.credits}>{t('machines.credits')}</Text>
      </ScrollView>

      {/* ------------------------------------------------------- actions -- */}
      <View style={[styles.actions, { paddingBottom: spacing.sm }]}>
        <Button label={runLabel} onPress={toggleRun} flex={2} />
        <Button label={t('common.reset')} variant="ghost" onPress={reset} flex={1} />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  modeBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.strokeSoft}`,
  },

  canvas: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: '38%',
    minHeight: 250,
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.stroke}`,
  },
  sceneBox: { flex: 1, maxWidth: 760, overflow: 'hidden' },

  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(8,11,18,0.72)',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' },
  badgeNote: { color: colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },

  controls: { flex: 1 },
  controlsContent: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },

  tip: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeft: `3px solid ${colors.amber}`,
    padding: spacing.md,
    gap: 4,
  },
  tipTitle: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tipBody: { color: colors.text, fontSize: 13.5, lineHeight: 19.5 },
  tipDismiss: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 4 },
  tipDismissText: { color: colors.amber, fontSize: 13, fontWeight: '800' },

  block: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.strokeSoft}`,
  },

  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
  },
  factLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  factValue: { color: colors.text, fontSize: 13, fontWeight: '700', fontVariantNumeric: 'tabular-nums' },
  equal: {
    marginTop: spacing.xs,
    backgroundColor: colors.accentGlow,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  equalText: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  hint: { color: colors.textFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  formulaNote: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 16,
    marginTop: -spacing.xs,
    paddingHorizontal: spacing.sm,
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
    borderTop: `1px solid ${colors.stroke}`,
  },
});
