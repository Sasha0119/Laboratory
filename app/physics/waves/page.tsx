'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from '../../../components/dom/index';

import { FormulaPanel } from '../../../components/sim/FormulaPanel';
import { IntroPanel } from '../../../components/sim/IntroPanel';
import { LevelBlurb } from '../../../components/sim/LevelBlurb';
import { WaveScene } from '../../../components/sim/WaveScene';
import { Readout, type DetailRow, type Stat } from '../../../components/readout/Readout';
import { Card } from '../../../components/ui/Card';
import { NumberField } from '../../../components/ui/NumberField';
import { Segmented } from '../../../components/ui/Segmented';
import { Toggle } from '../../../components/ui/Toggle';
import { useDetailMode } from '../../../context/DetailMode';
import { useDifficulty } from '../../../context/Difficulty';
import { useDismissiblePanel } from '../../../hooks/useDismissiblePanel';
import { useWaveSound } from '../../../hooks/useWaveSound';
import { formulaDisplayFor, showsExtraQuantities, usesPreciseTerms } from '../../../lib/difficulty';
import { friendly, precise } from '../../../lib/format';
import {
  MATERIALS,
  MATERIAL_ORDER,
  SMALL_SPEAKER_LIMIT,
  WAVE_LIMITS,
  audioMix,
  beatBand,
  beatFrequency,
  loudnessBand,
  period,
  pitchBand,
  slowdownFactor,
  viewWidth,
  wavelength,
  type MaterialId,
} from '../../../lib/physics/waves';
import { useSoundEnabled } from '../../../lib/soundSettings';
import { colors, radius, spacing } from '../../../theme';

/** Tightest the wave may be packed on screen, px per wavelength. */
const MIN_PX_PER_WAVE = 6;

const DEFAULT = {
  frequency: 440,
  amplitude: 60,
  /** A few hertz from the first wave, so turning it on gives a clear wobble. */
  secondFrequency: 444,
};

/** A fraction for a stat bar: frequency spans decades, so it is judged on a log scale. */
function frequencyFill(frequency: number): number {
  const low = Math.log(WAVE_LIMITS.frequencyMin);
  const high = Math.log(WAVE_LIMITS.frequencyMax);
  return (Math.log(frequency) - low) / (high - low);
}

export default function WavesSimulator() {
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const [soundOn] = useSoundEnabled();
  const precise_ = usesPreciseTerms(level);
  const pro = showsExtraQuantities(level);

  const intro = useDismissiblePanel('waves-intro');
  const starterTip = useDismissiblePanel('waves-tip-starter');
  const beatTip = useDismissiblePanel('waves-tip-beat');

  // ------------------------------------------------------------ parameters
  const [frequency, setFrequency] = useState(DEFAULT.frequency);
  const [amplitude, setAmplitude] = useState(DEFAULT.amplitude);
  const [material, setMaterial] = useState<MaterialId>('air');
  const [secondOn, setSecondOn] = useState(false);
  const [secondFrequency, setSecondFrequency] = useState(DEFAULT.secondFrequency);
  const [secondAmplitude, setSecondAmplitude] = useState(DEFAULT.amplitude);
  const [playing, setPlaying] = useState(false);

  const speed = MATERIALS[material].speed;
  const lambda = wavelength(speed, frequency);
  const secondLambda = wavelength(speed, secondFrequency);
  const fBeat = beatFrequency(frequency, secondFrequency);

  const second = useMemo(
    () => (secondOn ? { frequency: secondFrequency, amplitude: secondAmplitude } : null),
    [secondOn, secondFrequency, secondAmplitude]
  );

  // ----------------------------------------------------------------- sound
  const sound = useWaveSound();

  useEffect(() => {
    sound.setMix(audioMix({ frequency, amplitude }, second));
  }, [frequency, amplitude, second, sound]);

  // Starts on nothing but `playing`, which only a press of Play can set.
  useEffect(() => {
    if (playing && soundOn) sound.start();
    else sound.stop();
  }, [playing, soundOn, sound]);

  // Going elsewhere turns it off, and it stays off until Play is pressed again.
  useEffect(() => {
    const silence = () => {
      setPlaying(false);
      sound.stop();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') silence();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', silence);
    window.addEventListener('pagehide', silence);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', silence);
      window.removeEventListener('pagehide', silence);
    };
  }, [sound]);

  const onPlayChange = (next: boolean) => {
    // Called directly from the press as well as from the effect above: some
    // browsers only allow audio to start inside the press itself.
    if (next && soundOn) sound.start();
    setPlaying(next);
  };

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

  const span = viewWidth({
    speed,
    f1: frequency,
    f2: secondOn ? secondFrequency : null,
    maxCycles: Math.max(canvas.width, 1) / MIN_PX_PER_WAVE,
  });

  // --------------------------------------------------------------- readout
  const liveStats: Stat[] = useMemo(
    () => [
      {
        key: 'frequency',
        label: t(precise_ ? 'waves.stats.frequency' : 'waves.stats.wiggles'),
        value: frequency,
        unit: 'Hz',
        fill: frequencyFill(frequency),
        tone: colors.accent,
      },
      {
        key: 'wavelength',
        label: t(precise_ ? 'waves.stats.wavelength' : 'waves.stats.waveLength'),
        value: lambda,
        unit: 'm',
        tone: colors.blue,
      },
      {
        key: 'speed',
        label: t(precise_ ? 'waves.stats.speed' : 'waves.stats.howFast'),
        value: speed,
        unit: 'm/s',
        tone: colors.violet,
        format: (v) => v.toFixed(0),
      },
    ],
    [precise_, frequency, lambda, speed, t]
  );

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const rows: DetailRow[] = [
      { label: t('waves.details.frequency'), value: precise(frequency, 1), unit: 'Hz' },
      { label: t('waves.details.period'), value: precise(period(frequency) * 1000, 3), unit: 'ms' },
      { label: t('waves.details.wavelength'), value: precise(lambda, 3), unit: 'm' },
      { label: t('waves.details.speed'), value: precise(speed, 0), unit: 'm/s' },
      { label: t('waves.details.amplitude'), value: precise(amplitude, 0) },
    ];
    if (secondOn) {
      rows.push(
        { label: t('waves.details.secondFrequency'), value: precise(secondFrequency, 1), unit: 'Hz' },
        { label: t('waves.details.secondWavelength'), value: precise(secondLambda, 3), unit: 'm' },
        { label: t('waves.details.secondAmplitude'), value: precise(secondAmplitude, 0) },
        { label: t('waves.details.beat'), value: precise(fBeat, 1), unit: 'Hz' }
      );
    }
    return rows;
  }, [detailed, frequency, lambda, speed, amplitude, secondOn, secondFrequency, secondLambda, secondAmplitude, fBeat, t]);

  /** The wave in words, always on screen. Whole sentences, so each language can phrase them. */
  const words = useMemo(() => {
    const parts = [
      t(`waves.words.pitch.${pitchBand(frequency)}`),
      t(`waves.words.loudness.${loudnessBand(amplitude)}`),
      t(`waves.words.material.${material}`, { length: friendly(lambda) }),
    ];
    if (secondOn) parts.push(t(`waves.words.beat.${beatBand(fBeat)}`, { beats: Number(fBeat.toFixed(1)) }));
    return parts.join(' ');
  }, [frequency, amplitude, material, lambda, secondOn, fBeat, t]);

  const sceneLabels = useMemo(
    () => ({
      oneWave: t(precise_ ? 'waves.scene.lambda' : 'waves.scene.oneWave', { length: friendly(lambda) }),
      amplitude: t(precise_ ? 'waves.scene.amplitude' : 'waves.scene.height'),
      first: t('waves.scene.first'),
      second: t('waves.scene.second'),
      combined: t('waves.scene.combined'),
      loudness: t('waves.scene.loudness'),
      description: words,
    }),
    [precise_, lambda, words, t]
  );

  const showTips = !intro.visible;
  const playHint = !soundOn
    ? t('waves.play.muted')
    : frequency < SMALL_SPEAKER_LIMIT
      ? t('waves.play.lowTone')
      : t('waves.play.hint');

  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <WaveScene
            width={canvas.width}
            height={canvas.height}
            speed={speed}
            f1={frequency}
            a1={amplitude}
            second={second}
            span={span}
            labels={sceneLabels}
          />
        ) : null}
      </View>

      <Text style={styles.slowed}>{t('waves.slowed', { times: slowdownFactor(frequency) })}</Text>

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        {intro.visible ? (
          <IntroPanel
            title={t('waves.intro.title')}
            body={t('waves.intro.body')}
            onDismiss={intro.dismiss}
          />
        ) : null}

        {showTips && starterTip.visible ? (
          <TryThis body={t('waves.tryThis.starter')} onDismiss={starterTip.dismiss} />
        ) : null}
        {showTips && !starterTip.visible && beatTip.visible ? (
          <TryThis body={t('waves.tryThis.beat')} onDismiss={beatTip.dismiss} />
        ) : null}

        <LevelBlurb module="waves" />

        <Readout stats={liveStats} details={liveDetails} message={words} />

        <Card title={t('waves.cards.wave')}>
          <NumberField
            label={t('waves.fields.frequency')}
            value={frequency}
            min={WAVE_LIMITS.frequencyMin}
            max={WAVE_LIMITS.frequencyMax}
            unit="Hz"
            decimals={1}
            onCommit={setFrequency}
            hint={pro ? undefined : t('waves.fields.frequencyHint')}
          />
          <NumberField
            label={t('waves.fields.amplitude')}
            value={amplitude}
            min={WAVE_LIMITS.amplitudeMin}
            max={WAVE_LIMITS.amplitudeMax}
            decimals={0}
            onCommit={setAmplitude}
            hint={pro ? undefined : t('waves.fields.amplitudeHint')}
          />
        </Card>

        <Card title={t('waves.cards.material')}>
          <Text style={styles.help}>{t('waves.fields.materialHint')}</Text>
          <Segmented<MaterialId>
            options={MATERIAL_ORDER.map((id) => ({ value: id, label: t(`waves.materials.${id}`) }))}
            value={material}
            onChange={setMaterial}
          />
          <View style={styles.compare}>
            <Text style={styles.compareTitle}>{t('waves.compare.title')}</Text>
            {MATERIAL_ORDER.map((id) => (
              <LengthRow
                key={id}
                label={t(`waves.materials.${id}`)}
                length={wavelength(MATERIALS[id].speed, frequency)}
                longest={wavelength(MATERIALS.steel.speed, frequency)}
                active={id === material}
              />
            ))}
          </View>
        </Card>

        <Card title={t('waves.cards.second')}>
          <Toggle
            label={t('waves.fields.secondToggle')}
            description={t('waves.fields.secondToggleHint')}
            value={secondOn}
            onChange={setSecondOn}
          />
          {secondOn ? (
            <View style={styles.secondFields}>
              <NumberField
                label={t('waves.fields.secondFrequency')}
                value={secondFrequency}
                min={WAVE_LIMITS.frequencyMin}
                max={WAVE_LIMITS.frequencyMax}
                unit="Hz"
                decimals={1}
                onCommit={setSecondFrequency}
                hint={pro ? undefined : t('waves.fields.frequencyHint')}
              />
              <NumberField
                label={t('waves.fields.secondAmplitude')}
                value={secondAmplitude}
                min={WAVE_LIMITS.amplitudeMin}
                max={WAVE_LIMITS.amplitudeMax}
                decimals={0}
                onCommit={setSecondAmplitude}
                hint={pro ? undefined : t('waves.fields.amplitudeHint')}
              />
            </View>
          ) : null}
        </Card>

        <FormulaPanel module="waves" />
        {formulaDisplayFor(level) === 'open' ? (
          <Text style={styles.note}>{t('waves.assumptions')}</Text>
        ) : null}

        <Text style={styles.credits}>{t('waves.credits')}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <Toggle
          label={t('waves.play.label')}
          description={playHint}
          value={playing && soundOn}
          disabled={!soundOn}
          onChange={onPlayChange}
        />
      </View>
    </View>
  );
}

function TryThis({ body, onDismiss }: { body: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tip}>
      <Text style={styles.tipTitle}>{t('waves.tryThis.title')}</Text>
      <Text style={styles.tipBody}>{body}</Text>
      <Pressable onPress={onDismiss} style={styles.tipDismiss} accessibilityRole="button">
        <Text style={styles.tipDismissText}>{t('common.gotIt')}</Text>
      </Pressable>
    </View>
  );
}

/** One material's wavelength, drawn to scale against the longest of the three. */
function LengthRow({
  label,
  length,
  longest,
  active,
}: {
  label: string;
  length: number;
  longest: number;
  active: boolean;
}) {
  return (
    <View style={styles.lengthRow}>
      <Text style={[styles.lengthLabel, active && styles.lengthActive]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.lengthTrack}>
        <View
          style={[
            styles.lengthBar,
            { width: `${(length / longest) * 100}%`, backgroundColor: active ? colors.accent : colors.textFaint },
          ]}
        />
      </View>
      <Text style={[styles.lengthValue, active && styles.lengthActive]}>{friendlyLength(length)}</Text>
    </View>
  );
}

function friendlyLength(metres: number): string {
  return metres >= 100 ? `${metres.toFixed(0)} m` : `${friendly(metres)} m`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  canvas: {
    height: '36%',
    minHeight: 230,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
  },
  slowed: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderTop: `1px solid ${colors.stroke}`,
    borderBottom: `1px solid ${colors.stroke}`,
  },

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

  help: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm },
  compare: { marginTop: spacing.md, gap: 6 },
  compareTitle: { color: colors.textMuted, fontSize: 12, marginBottom: 2 },
  lengthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lengthLabel: { color: colors.textMuted, fontSize: 12, width: 62 },
  lengthActive: { color: colors.accent, fontWeight: '700' },
  lengthTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  lengthBar: { height: 6, borderRadius: 3 },
  lengthValue: { color: colors.textMuted, fontSize: 12, width: 58, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  secondFields: { marginTop: spacing.md },

  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: spacing.sm },
  credits: { color: colors.textFaint, fontSize: 11, lineHeight: 17, marginTop: spacing.sm, paddingHorizontal: 2 },

  actions: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgElevated,
    borderTop: `1px solid ${colors.stroke}`,
  },
});
