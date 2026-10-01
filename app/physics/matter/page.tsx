'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LineChart } from '../../../components/charts/LineChart';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from '../../../components/dom/index';
import { Readout, type DetailRow, type Stat } from '../../../components/readout/Readout';
import { FormulaPanel } from '../../../components/sim/FormulaPanel';
import { IntroPanel } from '../../../components/sim/IntroPanel';
import { LevelBlurb } from '../../../components/sim/LevelBlurb';
import { MatterScene } from '../../../components/sim/MatterScene';
import { Thermometer } from '../../../components/sim/Thermometer';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { NumberField } from '../../../components/ui/NumberField';
import { Segmented } from '../../../components/ui/Segmented';
import { Toggle } from '../../../components/ui/Toggle';
import { useDetailMode } from '../../../context/DetailMode';
import { useDifficulty } from '../../../context/Difficulty';
import { useDismissiblePanel } from '../../../hooks/useDismissiblePanel';
import { useMatterSim } from '../../../hooks/useMatterSim';
import { useMatterSound } from '../../../hooks/useMatterSound';
import { formulaDisplayFor, usesPreciseTerms } from '../../../lib/difficulty';
import { heatColor } from '../../../lib/matter/colors';
import { precise } from '../../../lib/format';
import { useSoundEnabled } from '../../../lib/soundSettings';
import {
  CUSTOM_DEFAULT,
  PRESET_DEFAULTS,
  PRESET_SUBSTANCES,
  SUBSTANCE_MASS,
  THERMO_LIMITS,
  heatLevel,
  latentHeatFor,
  specificHeatFor,
  temperatureWindow,
  toKelvin,
  type PhaseId,
  type PresetId,
  type Substance,
  type SubstanceId,
} from '../../../lib/physics/thermo';
import { colors, radius, spacing } from '../../../theme';

const SUBSTANCE_IDS: SubstanceId[] = ['water', 'iron', 'nitrogen', 'custom'];
const SPEEDS = [
  { value: '1', label: '1×' },
  { value: '5', label: '5×' },
  { value: '20', label: '20×' },
];
const THERMOMETER_WIDTH = 92;

/** A temperature with no "-0": a value that rounds to zero is just zero. */
function fmt(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

type StateName = 'solid' | 'liquid' | 'gas';

/** The state the substance is in, or the pair of states either side of a change. */
function stateOf(phase: PhaseId): { from: StateName; to: StateName | null } {
  switch (phase) {
    case 'solid':
      return { from: 'solid', to: null };
    case 'melting':
      return { from: 'solid', to: 'liquid' };
    case 'liquid':
      return { from: 'liquid', to: null };
    case 'boiling':
      return { from: 'liquid', to: 'gas' };
    default:
      return { from: 'gas', to: null };
  }
}

const STATE_TINT: Record<StateName, string> = {
  solid: colors.blue,
  liquid: colors.accent,
  gas: colors.rose,
};

export default function MatterSimulator() {
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);
  const intro = useDismissiblePanel('matter-intro');
  const [soundOn, setSoundOn] = useSoundEnabled();

  // ------------------------------------------------------------ parameters
  const [substanceId, setSubstanceId] = useState<SubstanceId>('water');
  const [custom, setCustom] = useState<Substance>(CUSTOM_DEFAULT);
  const [startTemperature, setStartTemperature] = useState(PRESET_DEFAULTS.water.startTemperature);
  const [heatRate, setHeatRate] = useState(PRESET_DEFAULTS.water.heatRate);
  const [speed, setSpeed] = useState('5');

  const substance: Substance = useMemo(
    () => (substanceId === 'custom' ? custom : PRESET_SUBSTANCES[substanceId]),
    [substanceId, custom]
  );

  const sim = useMatterSim({ substance, startTemperature, heatRate, speed: Number(speed) });
  const { live, snapshot, history, running } = sim;

  const choose = useCallback(
    (id: SubstanceId) => {
      setSubstanceId(id);
      if (id === 'custom') {
        setStartTemperature(Math.round(custom.meltingPoint - 30));
        setHeatRate(10_000);
      } else {
        setStartTemperature(PRESET_DEFAULTS[id as PresetId].startTemperature);
        setHeatRate(PRESET_DEFAULTS[id as PresetId].heatRate);
      }
    },
    [custom.meltingPoint]
  );

  const patchCustom = useCallback(
    (patch: Partial<Substance>) => setCustom((c) => ({ ...c, ...patch })),
    []
  );

  // ----------------------------------------------------------------- sound
  const sound = useMatterSound();
  useEffect(() => {
    const boil = running && snapshot.phase === 'boiling' ? (snapshot.heatRate >= 0 ? 1 : 0.4) : 0;
    const freeze = running && snapshot.phase === 'melting' && snapshot.heatRate < 0 ? 1 : 0;
    sound.setActivity(boil, freeze);
  }, [running, snapshot.phase, snapshot.heatRate, sound]);

  const toggleRun = () => {
    sound.unlock();
    if (running) sim.pause();
    else sim.start();
  };

  // ---------------------------------------------------------------- layout
  const [scene, setScene] = useState({ width: 0, height: 0 });
  const onSceneLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setScene((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }
    );
  }, []);
  const [panelWidth, setPanelWidth] = useState(0);

  // ----------------------------------------------------------------- state
  const { phase, fraction, temperature } = snapshot;
  const heating = heatRate >= 0;
  const states = stateOf(phase);
  const inChange = states.to !== null;
  const level01 = heatLevel(substance, temperature);
  const tint = heatColor(level01);
  const started = snapshot.time > 0;

  const changeName = inChange
    ? phase === 'melting'
      ? heating
        ? 'melting'
        : 'freezing'
      : heating
        ? 'boiling'
        : 'condensing'
    : null;

  const badgeTitle = changeName
    ? t(`matter.transitions.${changeName}`)
    : t(`matter.states.${states.from}`);
  const badgeSub = inChange
    ? heating
      ? `${t(`matter.states.${states.from}`)} → ${t(`matter.states.${states.to as StateName}`)}`
      : `${t(`matter.states.${states.to as StateName}`)} → ${t(`matter.states.${states.from}`)}`
    : null;
  const badgeTint = STATE_TINT[inChange && !heating ? (states.to as StateName) : states.from];

  const temperatureText = `${fmt(temperature, precise_ ? 1 : 0)} °C`;

  // --------------------------------------------------------------- readout
  const stats: Stat[] = useMemo(() => {
    const list: Stat[] = [
      {
        key: 'temperature',
        label: t('matter.stats.temperature'),
        value: temperature,
        unit: '°C',
        fill: level01,
        tone: tint,
        format: (v) => fmt(v, precise_ ? 1 : 0),
      },
    ];
    if (precise_ && changeName) {
      list.push({
        key: 'progress',
        label: t(`matter.stats.${changeName}Progress`),
        value: (heating ? fraction : 1 - fraction) * 100,
        unit: '%',
        fill: heating ? fraction : 1 - fraction,
        tone: colors.amber,
        format: (v) => fmt(v, 0),
      });
    }
    return list;
  }, [t, temperature, level01, tint, precise_, changeName, heating, fraction]);

  const details: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const c = specificHeatFor(substance, phase);
    const L = latentHeatFor(substance, phase);
    return [
      { label: t('matter.details.temperatureK'), value: precise(toKelvin(temperature), 2), unit: 'K' },
      { label: t('matter.details.energy'), value: precise(snapshot.energy, 0), unit: 'J' },
      { label: t('matter.details.heatRate'), value: precise(heatRate, 0), unit: 'W' },
      { label: t('matter.details.mass'), value: precise(SUBSTANCE_MASS, 2), unit: 'kg' },
      c != null
        ? { label: t('matter.details.specificHeat'), value: precise(c, 0), unit: 'J/(kg·K)' }
        : {
            label: t('matter.details.latentHeatNow'),
            value: precise(L ?? 0, 0),
            unit: 'J/kg',
          },
      { label: t('matter.details.meltingPoint'), value: precise(substance.meltingPoint, 1), unit: '°C' },
      { label: t('matter.details.boilingPoint'), value: precise(substance.boilingPoint, 1), unit: '°C' },
      { label: t('matter.details.latentFusion'), value: precise(substance.latentFusion, 0), unit: 'J/kg' },
      { label: t('matter.details.latentVaporization'), value: precise(substance.latentVaporization, 0), unit: 'J/kg' },
    ];
  }, [detailed, substance, phase, temperature, snapshot.energy, heatRate, t]);

  const message = useMemo(() => {
    if (snapshot.limit === 'cold' && heatRate < 0) return t('matter.messages.limitCold');
    if (snapshot.limit === 'hot' && heatRate > 0) return t('matter.messages.limitHot');
    if (!started) return t(heating ? 'matter.messages.ready' : 'matter.messages.readyCooling');
    if (!running) return t('matter.messages.paused');
    if (heatRate === 0) return t('matter.messages.noHeat');

    const kind = changeName ?? (heating ? 'heating' : 'cooling');
    if (precise_) {
      return t(`matter.messages.tech.${kind}`, { temp: fmt(temperature, 1) });
    }
    return t(`matter.messages.${kind}`);
  }, [snapshot.limit, heatRate, started, running, heating, changeName, precise_, temperature, t]);

  // ----------------------------------------------------------------- graph
  const graph = useMemo(() => {
    const window = temperatureWindow(substance);
    let lo = Math.min(window.low, startTemperature);
    let hi = Math.max(window.high, startTemperature);
    for (const p of history) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    const pad = (hi - lo) * 0.06;
    lo -= pad;
    hi += pad;

    const bands: { from: number; to: number; label?: string; color?: string }[] = [];
    let open: { kind: 'melting' | 'boiling'; from: number } | null = null;
    const close = (to: number) => {
      if (!open) return;
      let label: string | undefined;
      if (level !== 'beginner') {
        label =
          level === 'pro'
            ? t(`matter.graph.band.${open.kind}Pro`, {
                energy: precise(
                  ((open.kind === 'melting' ? substance.latentFusion : substance.latentVaporization) * SUBSTANCE_MASS) / 1000,
                  0
                ),
              })
            : t(`matter.graph.band.${open.kind}`);
      }
      bands.push({ from: open.from, to, label, color: open.kind === 'melting' ? colors.blue : colors.rose });
      open = null;
    };
    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      const kind = p.phase === 'melting' || p.phase === 'boiling' ? p.phase : null;
      if (kind && (!open || open.kind !== kind)) {
        close(p.x);
        open = { kind, from: p.x };
      } else if (!kind && open) {
        close(p.x);
      }
    }
    if (open && history.length > 0) close(history[history.length - 1].x);

    const references = precise_
      ? [
          {
            value: substance.meltingPoint,
            label: t('matter.graph.meltingPoint', { value: fmt(substance.meltingPoint, 1) }),
            color: colors.blue,
          },
          {
            value: substance.boilingPoint,
            label: t('matter.graph.boilingPoint', { value: fmt(substance.boilingPoint, 1) }),
            color: colors.rose,
          },
        ]
      : [];

    return { yDomain: [lo, hi] as [number, number], bands, references };
  }, [history, substance, startTemperature, level, precise_, t]);

  const showFormulaNote = formulaDisplayFor(level) !== 'hidden';

  // The custom substance must stay physically sensible: melting below boiling.
  const customMeltMax = Math.min(THERMO_LIMITS.pointMax, custom.boilingPoint - 1);
  const customBoilMin = Math.max(THERMO_LIMITS.pointMin, custom.meltingPoint + 1);

  const atWall =
    (snapshot.limit === 'cold' && heatRate < 0) || (snapshot.limit === 'hot' && heatRate > 0);
  const runLabel = running
    ? t('matter.buttons.pause')
    : started
      ? t('matter.buttons.resume')
      : t(heating ? 'matter.buttons.startHeating' : 'matter.buttons.startCooling');

  return (
    <View style={styles.screen}>
      {/* ------------------------------------------------------- canvas -- */}
      <View style={styles.canvas}>
        <View style={styles.sceneBox} onLayout={onSceneLayout}>
          {scene.width > 0 ? (
            <MatterScene width={scene.width} height={scene.height} live={live} substance={substance} />
          ) : null}
          <View style={[styles.badge, { pointerEvents: 'none', borderColor: badgeTint + '77' }]}>
            <View style={[styles.badgeDot, { backgroundColor: badgeTint }]} />
            <View>
              <Text style={[styles.badgeTitle, { color: badgeTint }]}>{badgeTitle}</Text>
              {badgeSub ? <Text style={styles.badgeSub}>{badgeSub}</Text> : null}
            </View>
          </View>
        </View>
        <View style={styles.thermo}>
          {scene.height > 0 ? (
            <Thermometer
              height={scene.height}
              substance={substance}
              temperature={temperature}
              valueText={temperatureText}
              meltText={t('matter.thermometer.melts')}
              boilText={t('matter.thermometer.boils')}
            />
          ) : null}
        </View>
      </View>

      {/* ---------------------------------------------------- controls -- */}
      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width - spacing.md * 4 - 2)}
      >
        {intro.visible ? (
          <IntroPanel
            title={t('matter.intro.title')}
            body={t('matter.intro.body')}
            tip={t('matter.intro.tip')}
            onDismiss={intro.dismiss}
          />
        ) : null}

        <LevelBlurb module="matter" />

        <Readout stats={stats} details={details} message={message} />

        {precise_ ? (
          <Card title={t('matter.cards.facts')}>
            <Fact label={t('matter.details.meltingPoint')} value={`${fmt(substance.meltingPoint, 1)} °C`} />
            <Fact label={t('matter.details.boilingPoint')} value={`${fmt(substance.boilingPoint, 1)} °C`} />
            <Fact
              label={t('matter.details.specificHeat')}
              value={
                specificHeatFor(substance, phase) != null
                  ? `${precise(specificHeatFor(substance, phase) as number, 0)} J/(kg·K)`
                  : t('matter.facts.duringChange')
              }
            />
          </Card>
        ) : null}

        <Card title={t('matter.cards.graph')}>
          {history.length < 2 ? (
            <Text style={styles.graphEmpty}>{t('matter.graph.empty')}</Text>
          ) : null}
          {panelWidth > 0 ? (
            <LineChart
              series={[
                {
                  points: history.map((p) => ({ x: p.x, y: p.y })),
                  color: colors.accent,
                  label: t('matter.graph.series'),
                },
              ]}
              width={panelWidth}
              height={190}
              xLabel={t('matter.graph.x')}
              yLabel={t('matter.graph.y')}
              yDomain={graph.yDomain}
              includeZero={false}
              formatY={(v) => String(Math.round(v))}
              formatX={(v) => String(Math.round(v))}
              references={graph.references}
              bands={graph.bands}
            />
          ) : null}
          <Text style={styles.hint}>{t('matter.graph.hint')}</Text>
        </Card>

        <Card title={t('matter.cards.substance')}>
          <Segmented<SubstanceId>
            options={SUBSTANCE_IDS.map((id) => ({ value: id, label: t(`matter.substances.${id}`) }))}
            value={substanceId}
            onChange={choose}
            disabled={running}
          />
          <Text style={styles.hint}>
            {t(substanceId === 'custom' ? 'matter.substanceHint.custom' : 'matter.substanceHint.preset')}
          </Text>
        </Card>

        {substanceId === 'custom' ? (
          <Card title={t('matter.cards.custom')}>
            <NumberField
              label={t('matter.fields.meltingPoint')}
              value={custom.meltingPoint}
              min={THERMO_LIMITS.pointMin}
              max={customMeltMax}
              unit="°C"
              decimals={1}
              disabled={running}
              onCommit={(v) => patchCustom({ meltingPoint: v })}
            />
            <NumberField
              label={t('matter.fields.boilingPoint')}
              value={custom.boilingPoint}
              min={customBoilMin}
              max={THERMO_LIMITS.pointMax}
              unit="°C"
              decimals={1}
              disabled={running}
              onCommit={(v) => patchCustom({ boilingPoint: v })}
            />
            <NumberField
              label={t('matter.fields.cSolid')}
              value={custom.cSolid}
              min={THERMO_LIMITS.specificHeatMin}
              max={THERMO_LIMITS.specificHeatMax}
              unit="J/(kg·K)"
              decimals={0}
              disabled={running}
              hint={!precise_ ? t('matter.fields.specificHeatHint') : undefined}
              onCommit={(v) => patchCustom({ cSolid: v })}
            />
            <NumberField
              label={t('matter.fields.cLiquid')}
              value={custom.cLiquid}
              min={THERMO_LIMITS.specificHeatMin}
              max={THERMO_LIMITS.specificHeatMax}
              unit="J/(kg·K)"
              decimals={0}
              disabled={running}
              onCommit={(v) => patchCustom({ cLiquid: v })}
            />
            <NumberField
              label={t('matter.fields.cGas')}
              value={custom.cGas}
              min={THERMO_LIMITS.specificHeatMin}
              max={THERMO_LIMITS.specificHeatMax}
              unit="J/(kg·K)"
              decimals={0}
              disabled={running}
              onCommit={(v) => patchCustom({ cGas: v })}
            />
            <NumberField
              label={t('matter.fields.latentFusion')}
              value={custom.latentFusion}
              min={THERMO_LIMITS.latentHeatMin}
              max={THERMO_LIMITS.latentHeatMax}
              unit="J/kg"
              decimals={0}
              disabled={running}
              hint={!precise_ ? t('matter.fields.latentHint') : undefined}
              onCommit={(v) => patchCustom({ latentFusion: v })}
            />
            <NumberField
              label={t('matter.fields.latentVaporization')}
              value={custom.latentVaporization}
              min={THERMO_LIMITS.latentHeatMin}
              max={THERMO_LIMITS.latentHeatMax}
              unit="J/kg"
              decimals={0}
              disabled={running}
              onCommit={(v) => patchCustom({ latentVaporization: v })}
            />
          </Card>
        ) : null}

        <Card title={t('matter.cards.heating')}>
          <NumberField
            label={t('matter.fields.startTemperature')}
            value={startTemperature}
            min={THERMO_LIMITS.startTemperatureMin}
            max={THERMO_LIMITS.startTemperatureMax}
            unit="°C"
            decimals={0}
            disabled={running}
            hint={t('matter.fields.startTemperatureHint')}
            onCommit={setStartTemperature}
          />
          <View style={styles.block}>
            <NumberField
              label={t('matter.fields.heatRate')}
              value={heatRate}
              min={THERMO_LIMITS.heatRateMin}
              max={THERMO_LIMITS.heatRateMax}
              unit="W"
              decimals={0}
              hint={t('matter.fields.heatRateHint')}
              onCommit={setHeatRate}
            />
          </View>
          <View style={styles.block}>
            <Text style={styles.subLabel}>{t('matter.fields.speed')}</Text>
            <Segmented<string> options={SPEEDS} value={speed} onChange={setSpeed} compact />
            <Text style={styles.hint}>{t('matter.fields.speedHint')}</Text>
          </View>
          <View style={styles.block}>
            <Toggle
              label={t('settings.soundLabel')}
              description={t('matter.fields.soundHint')}
              value={soundOn}
              onChange={setSoundOn}
            />
          </View>
        </Card>

        <FormulaPanel module="matter" />
        {showFormulaNote ? <Text style={styles.formulaNote}>{t('matter.formulaNote')}</Text> : null}

        <Text style={styles.credits}>{t('matter.credits')}</Text>
      </ScrollView>

      {/* ------------------------------------------------------- actions -- */}
      <View style={[styles.actions, { paddingBottom: spacing.sm }]}>
        <Button label={runLabel} onPress={toggleRun} disabled={atWall} flex={2} />
        <Button label={t('common.reset')} variant="ghost" onPress={sim.reset} flex={1} />
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

  canvas: {
    flexDirection: 'row',
    justifyContent: 'center',
    height: '40%',
    minHeight: 250,
    backgroundColor: colors.bgElevated,
    borderBottom: `1px solid ${colors.stroke}`,
  },
  // Wide enough to hold the particles comfortably, narrow enough that they
  // do not look lost in a very wide window.
  sceneBox: { flex: 1, maxWidth: 700, overflow: 'hidden' },
  thermo: { width: THERMOMETER_WIDTH, paddingRight: spacing.xs },

  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,11,18,0.72)',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeDot: { width: 9, height: 9, borderRadius: radius.pill },
  badgeTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  badgeSub: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },

  controls: { flex: 1 },
  controlsContent: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },

  block: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.strokeSoft}`,
  },
  subLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  hint: { color: colors.textFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.xs },

  graphEmpty: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm },

  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  factLabel: { color: colors.textMuted, fontSize: 13 },
  factValue: { color: colors.text, fontSize: 13.5, fontWeight: '700', fontVariantNumeric: 'tabular-nums' },

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
