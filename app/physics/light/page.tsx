'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from '../../../components/dom/index';

import { FormulaPanel } from '../../../components/sim/FormulaPanel';
import { IntroPanel } from '../../../components/sim/IntroPanel';
import { LevelBlurb } from '../../../components/sim/LevelBlurb';
import { LightScene, RAY_COLORS } from '../../../components/sim/LightScene';
import { Readout, type DetailRow, type Stat } from '../../../components/readout/Readout';
import { Card } from '../../../components/ui/Card';
import { NumberField } from '../../../components/ui/NumberField';
import { useDetailMode } from '../../../context/DetailMode';
import { useDifficulty } from '../../../context/Difficulty';
import { useDismissiblePanel } from '../../../hooks/useDismissiblePanel';
import { formulaDisplayFor, usesPreciseTerms } from '../../../lib/difficulty';
import { precise } from '../../../lib/format';
import {
  LIGHT_LIMITS,
  MEDIUM_ORDER,
  REFERENCE_WAVELENGTH_NM,
  indexOf,
  solveBoundary,
  type MediumId,
} from '../../../lib/physics/light';
import { colors, radius, spacing } from '../../../theme';

const DEFAULT = {
  angle: 45,
  a: 'air' as MediumId,
  b: 'water' as MediumId,
  /** Starting index for a Custom material: about that of a typical plastic. */
  custom: 1.5,
};

/** One decimal for angles, so 48.75° reads 48.8° and 0° reads 0°. */
function deg(value: number): string {
  return `${Number(value.toFixed(1))}°`;
}

/** Indices always shown with two decimals, as on a data sheet: 1.00, 1.33. */
function nText(n: number): string {
  return n.toFixed(2);
}

export default function LightSimulator() {
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);

  const intro = useDismissiblePanel('light-intro');
  const starterTip = useDismissiblePanel('light-tip-starter');
  const tirTip = useDismissiblePanel('light-tip-tir');

  // ------------------------------------------------------------ parameters
  const [angle, setAngle] = useState(DEFAULT.angle);
  const [mediumA, setMediumA] = useState<MediumId>(DEFAULT.a);
  const [mediumB, setMediumB] = useState<MediumId>(DEFAULT.b);
  const [customA, setCustomA] = useState(DEFAULT.custom);
  const [customB, setCustomB] = useState(DEFAULT.custom);

  const n1 = indexOf(mediumA, customA);
  const n2 = indexOf(mediumB, customB);
  const r = useMemo(() => solveBoundary(n1, n2, angle), [n1, n2, angle]);

  const nameOf = useCallback((id: MediumId) => t(`light.media.${id}`), [t]);
  const nameA = nameOf(mediumA);
  const nameB = nameOf(mediumB);

  /** Light always goes from A into B; swapping lets the reader go back out. */
  const swap = useCallback(() => {
    setMediumA(mediumB);
    setMediumB(mediumA);
    setCustomA(customB);
    setCustomB(customA);
  }, [mediumA, mediumB, customA, customB]);

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

  // ----------------------------------------------------------------- words
  /** What is happening right now, always on screen. Plain at Beginner, proper terms above. */
  const words = useMemo(() => {
    const group = precise_ ? 'wordsPrecise' : 'words';
    return t(`light.${group}.${r.behaviour}`, {
      a: nameA,
      b: nameB,
      critical: r.critical !== null ? deg(r.critical) : '',
    });
  }, [precise_, r.behaviour, r.critical, nameA, nameB, t]);

  const description = useMemo(() => {
    const values = {
      a: nameA,
      b: nameB,
      n1: nText(r.n1),
      n2: nText(r.n2),
      incident: deg(r.incident),
      refracted: r.refracted !== null ? deg(r.refracted) : '',
    };
    return [
      t(r.tir ? 'light.scene.descriptionTir' : 'light.scene.description', values),
      words,
    ].join(' ');
  }, [nameA, nameB, r, words, t]);

  const sceneLabels = useMemo(
    () => ({
      mediumA: t('light.scene.medium', { name: nameA, n: nText(r.n1) }),
      mediumB: t('light.scene.medium', { name: nameB, n: nText(r.n2) }),
      incoming: t('light.scene.incoming'),
      reflected: t('light.scene.reflected'),
      bent: t('light.scene.bent'),
      normal: t('light.scene.normal'),
      incidentAngle: precise_ ? `θ₁ ${deg(r.incident)}` : deg(r.incident),
      reflectedAngle: precise_ ? `θr ${deg(r.reflected)}` : deg(r.reflected),
      refractedAngle:
        r.refracted === null ? null : precise_ ? `θ₂ ${deg(r.refracted)}` : deg(r.refracted),
      // The critical angle is a named idea from Intermediate up.
      critical: precise_ && r.critical !== null ? `θc ${deg(r.critical)}` : null,
      tirBanner: r.tir ? t('light.scene.tir') : null,
      description,
    }),
    [precise_, nameA, nameB, r, description, t]
  );

  // --------------------------------------------------------------- readout
  const liveStats: Stat[] = useMemo(() => {
    const stats: Stat[] = [
      {
        key: 'incident',
        label: t(precise_ ? 'light.stats.incident' : 'light.stats.comesIn'),
        value: r.incident,
        unit: '°',
        fill: r.incident / 90,
        tone: RAY_COLORS.incoming,
        format: (v) => Number(v.toFixed(1)).toString(),
      },
      {
        key: 'refracted',
        label: t(precise_ ? 'light.stats.refracted' : 'light.stats.bendsTo'),
        value: r.refracted ?? 0,
        unit: r.refracted === null ? undefined : '°',
        fill: r.refracted === null ? 0 : r.refracted / 90,
        tone: RAY_COLORS.bent,
        format: r.refracted === null ? () => '—' : (v) => Number(v.toFixed(1)).toString(),
        caption: r.tir ? t('light.stats.noneGetsOut') : undefined,
      },
    ];
    if (precise_ && r.critical !== null) {
      stats.push({
        key: 'critical',
        label: t('light.stats.critical'),
        value: r.critical,
        unit: '°',
        fill: r.critical / 90,
        tone: RAY_COLORS.critical,
        format: (v) => Number(v.toFixed(1)).toString(),
      });
    } else {
      // How fast light goes in the lower material, as a share of its top speed.
      stats.push({
        key: 'speed',
        label: t('light.stats.speedIn', { name: nameB }),
        value: 100 / r.n2,
        unit: '%',
        fill: 1 / r.n2,
        tone: colors.blue,
        format: (v) => v.toFixed(0),
        caption: t('light.stats.ofTopSpeed'),
      });
    }
    return stats;
  }, [precise_, r, nameB, t]);

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const mps = (v: number) => Math.round(v).toLocaleString('en-US').replace(/,/g, ' ');
    return [
      { label: t('light.details.n1', { name: nameA }), value: nText(r.n1) },
      { label: t('light.details.n2', { name: nameB }), value: nText(r.n2) },
      { label: t('light.details.incident'), value: precise(r.incident, 2), unit: '°' },
      { label: t('light.details.reflected'), value: precise(r.reflected, 2), unit: '°' },
      {
        label: t('light.details.refracted'),
        value: r.refracted === null ? t('light.details.tir') : precise(r.refracted, 2),
        unit: r.refracted === null ? '' : '°',
      },
      {
        label: t('light.details.critical'),
        value: r.critical === null ? t('light.details.noCritical') : precise(r.critical, 2),
        unit: r.critical === null ? '' : '°',
      },
      { label: t('light.details.v1', { name: nameA }), value: mps(r.v1), unit: 'm/s' },
      { label: t('light.details.v2', { name: nameB }), value: mps(r.v2), unit: 'm/s' },
      { label: t('light.details.frequency'), value: precise(r.frequency / 1e12, 1), unit: 'THz' },
      { label: t('light.details.lambda1', { name: nameA }), value: precise(r.lambda1, 1), unit: 'nm' },
      { label: t('light.details.lambda2', { name: nameB }), value: precise(r.lambda2, 1), unit: 'nm' },
    ];
  }, [detailed, r, nameA, nameB, t]);

  const showTips = !intro.visible;

  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <LightScene width={canvas.width} height={canvas.height} result={r} labels={sceneLabels} />
        ) : null}
      </View>

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        {intro.visible ? (
          <IntroPanel title={t('light.intro.title')} body={t('light.intro.body')} onDismiss={intro.dismiss} />
        ) : null}

        {showTips && starterTip.visible ? (
          <TryThis body={t('light.tryThis.starter')} onDismiss={starterTip.dismiss} />
        ) : null}
        {showTips && !starterTip.visible && tirTip.visible ? (
          <TryThis body={t('light.tryThis.tir')} onDismiss={tirTip.dismiss} />
        ) : null}

        <LevelBlurb module="light" />

        <Readout
          stats={liveStats}
          details={liveDetails}
          message={words}
          messageTone={r.tir ? RAY_COLORS.reflected : undefined}
        />

        <Card title={t('light.cards.ray')}>
          <NumberField
            label={t(precise_ ? 'light.fields.incident' : 'light.fields.angle')}
            value={angle}
            min={LIGHT_LIMITS.angleMin}
            max={LIGHT_LIMITS.angleMax}
            unit="°"
            decimals={1}
            onCommit={setAngle}
            hint={t(precise_ ? 'light.fields.incidentHint' : 'light.fields.angleHint')}
          />
        </Card>

        <Card title={t('light.cards.materials')}>
          <Text style={styles.help}>{t('light.fields.direction')}</Text>

          <MediumPicker
            label={t('light.fields.mediumA')}
            value={mediumA}
            custom={customA}
            onChange={setMediumA}
            nameOf={nameOf}
          />
          {mediumA === 'custom' ? (
            <NumberField
              label={t('light.fields.customA')}
              value={customA}
              min={LIGHT_LIMITS.indexMin}
              max={LIGHT_LIMITS.indexMax}
              decimals={2}
              onCommit={setCustomA}
              hint={t('light.fields.customHint')}
            />
          ) : null}

          <Pressable
            onPress={swap}
            style={styles.swap}
            accessibilityRole="button"
            accessibilityLabel={t('light.fields.swapLabel', { a: nameA, b: nameB })}
          >
            <Text style={styles.swapIcon}>⇅</Text>
            <Text style={styles.swapText}>{t('light.fields.swap')}</Text>
          </Pressable>

          <MediumPicker
            label={t('light.fields.mediumB')}
            value={mediumB}
            custom={customB}
            onChange={setMediumB}
            nameOf={nameOf}
          />
          {mediumB === 'custom' ? (
            <NumberField
              label={t('light.fields.customB')}
              value={customB}
              min={LIGHT_LIMITS.indexMin}
              max={LIGHT_LIMITS.indexMax}
              decimals={2}
              onCommit={setCustomB}
              hint={t('light.fields.customHint')}
            />
          ) : null}
        </Card>

        <View style={styles.key} accessibilityLabel={t('light.key.title')}>
          <KeyRow color={RAY_COLORS.incoming} dash="solid" label={t('light.key.incoming')} />
          <KeyRow color={RAY_COLORS.reflected} dash="dashed" label={t('light.key.reflected')} />
          <KeyRow color={RAY_COLORS.bent} dash="dashdot" label={t('light.key.bent')} />
        </View>

        <FormulaPanel module="light" />
        {formulaDisplayFor(level) === 'open' ? (
          <Text style={styles.note}>{t('light.assumptions', { nm: REFERENCE_WAVELENGTH_NM })}</Text>
        ) : null}

        <Text style={styles.credits}>{t('light.credits')}</Text>
      </ScrollView>
    </View>
  );
}

/** A choice of material: name and index on each option, wrapping on narrow screens. */
function MediumPicker({
  label,
  value,
  custom,
  onChange,
  nameOf,
}: {
  label: string;
  value: MediumId;
  custom: number;
  onChange: (id: MediumId) => void;
  nameOf: (id: MediumId) => string;
}) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {MEDIUM_ORDER.map((id) => {
          const active = id === value;
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipName, active && styles.chipNameActive]} numberOfLines={1}>
                {nameOf(id)}
              </Text>
              <Text style={styles.chipIndex}>n = {nText(indexOf(id, custom))}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One line of the ray key: a sample of the line style, and its name. */
function KeyRow({ color, dash, label }: { color: string; dash: 'solid' | 'dashed' | 'dashdot'; label: string }) {
  const pattern = dash === 'solid' ? undefined : dash === 'dashed' ? '10 6' : '16 5 3 5';
  return (
    <View style={styles.keyRow}>
      <svg width={44} height={10} aria-hidden="true">
        <line x1={2} y1={5} x2={42} y2={5} stroke={color} strokeWidth={3} strokeDasharray={pattern} strokeLinecap="round" />
      </svg>
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

function TryThis({ body, onDismiss }: { body: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tip}>
      <Text style={styles.tipTitle}>{t('light.tryThis.title')}</Text>
      <Text style={styles.tipBody}>{body}</Text>
      <Pressable onPress={onDismiss} style={styles.tipDismiss} accessibilityRole="button">
        <Text style={styles.tipDismissText}>{t('common.gotIt')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  canvas: {
    height: '40%',
    minHeight: 240,
    backgroundColor: colors.bgElevated,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
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
  tipDismiss: {
    alignSelf: 'flex-end',
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tipDismissText: { color: colors.amber, fontSize: 13, fontWeight: '800' },

  help: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm },

  picker: { marginBottom: spacing.sm },
  pickerLabel: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexGrow: 1,
    flexBasis: 84,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.bgElevated,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentGlow },
  chipName: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipNameActive: { color: colors.accent, fontWeight: '800' },
  chipIndex: { color: colors.textFaint, fontSize: 11, fontVariantNumeric: 'tabular-nums' },

  swap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.surfaceAlt,
  },
  swapIcon: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  swapText: { color: colors.text, fontSize: 14, fontWeight: '700' },

  key: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  keyText: { color: colors.textMuted, fontSize: 12.5 },

  note: { color: colors.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: spacing.sm },
  credits: { color: colors.textFaint, fontSize: 11, lineHeight: 17, marginTop: spacing.sm, paddingHorizontal: 2 },
});
