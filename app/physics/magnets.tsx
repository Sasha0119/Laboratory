import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutChangeEvent, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MagnetScene } from '../../components/sim/MagnetScene';
import { FormulaPanel } from '../../components/sim/FormulaPanel';
import { IntroPanel } from '../../components/sim/IntroPanel';
import { LevelBlurb } from '../../components/sim/LevelBlurb';
import { Readout, type DetailRow, type Stat } from '../../components/readout/Readout';
import { Card } from '../../components/ui/Card';
import { NumberField } from '../../components/ui/NumberField';
import { Segmented } from '../../components/ui/Segmented';
import { useDismissiblePanel } from '../../hooks/useDismissiblePanel';
import { useMagnetSim } from '../../hooks/useMagnetSim';
import { useMagnetSound } from '../../hooks/useMagnetSound';
import { useDetailMode } from '../../context/DetailMode';
import { useDifficulty } from '../../context/Difficulty';
import { formulaDisplayFor, usesPreciseTerms } from '../../lib/difficulty';
import { LIMITS } from '../../lib/physics/constants';
import {
  SNAP_DISTANCE,
  forceFraction,
  type Orientation,
} from '../../lib/physics/magnetism';
import { precise } from '../../lib/format';
import { colors, radius, spacing } from '../../theme';

const ORIENTATION_IDS: Orientation[] = ['attract', 'repel'];

export default function MagnetsSimulator() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);

  const magnetLabel = useCallback((i: number) => t('magnets.magnetLabel', { n: i + 1 }), [t]);
  const intro = useDismissiblePanel('magnets-intro');

  // ------------------------------------------------------------ parameters
  const [distance, setDistance] = useState(15);
  const [strengthA, setStrengthA] = useState(60);
  const [strengthB, setStrengthB] = useState(60);
  const [orientation, setOrientation] = useState<Orientation>('attract');

  const simInput = useMemo(
    () => ({ distance, strengthA, strengthB, orientation }),
    [distance, strengthA, strengthB, orientation]
  );

  // ------------------------------------------------------------ audio/haptics
  const sound = useMagnetSound();
  const onSnap = useCallback(() => {
    sound.playClick();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }
  }, [sound]);

  const { force, display, snapPulse } = useMagnetSim({ input: simInput, onSnap });

  useEffect(() => {
    sound.setForce(forceFraction(force.magnitude));
  }, [force.magnitude, sound]);

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

  // ---------------------------------------------------------------- readout
  const intensity = forceFraction(force.magnitude);

  const liveStats: Stat[] = useMemo(() => {
    if (precise_) {
      return [
        {
          key: 'force',
          label: t('magnets.stats.force'),
          value: force.magnitude,
          fill: intensity,
          tone: force.attracting ? colors.accent : colors.rose,
          caption: force.attracting ? t('magnets.stats.pulling') : t('magnets.stats.pushing'),
        },
      ];
    }
    return [
      {
        key: 'force',
        label: force.attracting ? t('magnets.stats.pulling') : t('magnets.stats.pushing'),
        value: intensity * 100,
        unit: '%',
        fill: intensity,
        tone: force.attracting ? colors.accent : colors.rose,
      },
    ];
  }, [precise_, force, intensity, t]);

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    return [
      { label: t('magnets.details.distance'), value: precise(distance, 2), unit: 'cm' },
      { label: t('magnets.details.strengthOf', { name: magnetLabel(0) }), value: precise(strengthA, 1), unit: '' },
      { label: t('magnets.details.strengthOf', { name: magnetLabel(1) }), value: precise(strengthB, 1), unit: '' },
      { label: t('magnets.details.orientation'), value: t(`magnets.orientation.${orientation}`), unit: '' },
      { label: t('magnets.details.force'), value: precise(force.magnitude, 3), unit: '' },
    ];
  }, [detailed, distance, strengthA, strengthB, orientation, force.magnitude, t, magnetLabel]);

  const message = useMemo(() => {
    if (force.attracting && distance <= SNAP_DISTANCE) return t('magnets.messages.snapped');
    const bucket = intensity > 0.7 ? 'Strong' : intensity > 0.3 ? '' : 'Weak';
    const key = force.attracting ? `pulling${bucket}` : `pushing${bucket}`;
    return t(`magnets.messages.${key}`);
  }, [force.attracting, distance, intensity, t]);

  const showFormulaNote = formulaDisplayFor(level) !== 'hidden';

  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <MagnetScene width={canvas.width} height={canvas.height} display={display} snapPulse={snapPulse} />
        ) : null}
        <View
          style={[
            styles.badge,
            { pointerEvents: 'none' },
            {
              borderWidth: 1,
              borderColor: (orientation === 'attract' ? colors.accent : colors.rose) + '66',
            },
          ]}
        >
          <View
            style={[
              styles.badgeDot,
              { backgroundColor: orientation === 'attract' ? colors.accent : colors.rose },
            ]}
          />
          <Text
            style={[
              styles.badgeText,
              { color: orientation === 'attract' ? colors.accent : colors.rose },
            ]}
          >
            {t(`magnets.orientation.${orientation}`)}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        {intro.visible ? (
          <IntroPanel
            title={t('magnets.intro.title')}
            body={t('magnets.intro.body')}
            tip={t('magnets.intro.tip')}
            onDismiss={intro.dismiss}
          />
        ) : null}

        <LevelBlurb module="magnets" />

        <Readout stats={liveStats} details={liveDetails} message={message} />

        <Card title={t('magnets.cards.magnets')}>
          <NumberField
            label={t('magnets.sliders.distance')}
            value={distance}
            min={LIMITS.magnetDistanceMin}
            max={LIMITS.magnetDistanceMax}
            unit="cm"
            decimals={1}
            onCommit={setDistance}
          />

          <View style={styles.orientationBlock}>
            <Text style={styles.subLabel}>{t('magnets.orientationLabel')}</Text>
            <Segmented<Orientation>
              options={ORIENTATION_IDS.map((id) => ({ value: id, label: t(`magnets.orientation.${id}`) }))}
              value={orientation}
              onChange={setOrientation}
              tint={orientation === 'attract' ? colors.accent : colors.rose}
            />
            <Text style={styles.hint}>{t('magnets.orientationHint')}</Text>
          </View>

          <View style={styles.strengthBlock}>
            <NumberField
              label={t('magnets.sliders.strengthOf', { name: magnetLabel(0) })}
              value={strengthA}
              min={LIMITS.magnetStrengthMin}
              max={LIMITS.magnetStrengthMax}
              decimals={0}
              onCommit={setStrengthA}
              hint={!precise_ ? t('magnets.sliders.strengthHint') : undefined}
            />
            <NumberField
              label={t('magnets.sliders.strengthOf', { name: magnetLabel(1) })}
              value={strengthB}
              min={LIMITS.magnetStrengthMin}
              max={LIMITS.magnetStrengthMax}
              decimals={0}
              onCommit={setStrengthB}
              hint={!precise_ ? t('magnets.sliders.strengthHint') : undefined}
            />
          </View>
        </Card>

        <FormulaPanel module="magnets" />
        {showFormulaNote ? <Text style={styles.formulaNote}>{t('magnets.formulaNote')}</Text> : null}

        <Text style={styles.credits}>{t('magnets.credits')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  canvas: {
    height: '32%',
    minHeight: 200,
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
  badgeDot: { width: 6, height: 6, borderRadius: radius.pill },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '700' },

  controls: { flex: 1 },
  controlsContent: { padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },

  subLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  orientationBlock: { marginTop: spacing.md },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: spacing.xs },
  strengthBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },

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
});
