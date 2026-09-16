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

import { CircuitScene } from '../../components/sim/CircuitScene';
import { FormulaPanel } from '../../components/sim/FormulaPanel';
import { LevelBlurb } from '../../components/sim/LevelBlurb';
import { Readout, type DetailRow, type Stat } from '../../components/readout/Readout';
import { Card } from '../../components/ui/Card';
import { NumberField } from '../../components/ui/NumberField';
import { Segmented } from '../../components/ui/Segmented';
import { Toggle } from '../../components/ui/Toggle';
import { useCircuitSim } from '../../hooks/useCircuitSim';
import { useCircuitSound } from '../../hooks/useCircuitSound';
import { useDetailMode } from '../../context/DetailMode';
import { useDifficulty } from '../../context/Difficulty';
import { usesPreciseTerms } from '../../lib/difficulty';
import { LIMITS } from '../../lib/physics/constants';
import type { BulbInput, WiringMode } from '../../lib/physics/circuit';
import { friendly, precise } from '../../lib/format';
import { colors, radius, spacing } from '../../theme';

const BULB_COUNT_OPTIONS = ['1', '2'] as const;
const WIRING_IDS: WiringMode[] = ['series', 'parallel'];

export default function CircuitsSimulator() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { detailed } = useDetailMode();
  const { level } = useDifficulty();
  const precise_ = usesPreciseTerms(level);

  const bulbLabel = useCallback((i: number) => t('circuits.bulbLabel', { n: i + 1 }), [t]);

  // ------------------------------------------------------------ parameters
  const [voltage, setVoltage] = useState(9);
  const [bulbCountStr, setBulbCountStr] = useState<'1' | '2'>('1');
  const bulbCount = (bulbCountStr === '2' ? 2 : 1) as 1 | 2;
  const [wiring, setWiring] = useState<WiringMode>('series');
  const [resistanceA, setResistanceA] = useState(20);
  const [resistanceB, setResistanceB] = useState(20);
  const [switchClosed, setSwitchClosed] = useState(true);

  const bulbs: BulbInput[] = useMemo(() => {
    const list: BulbInput[] = [{ resistance: resistanceA }];
    if (bulbCount === 2) list.push({ resistance: resistanceB });
    return list;
  }, [resistanceA, resistanceB, bulbCount]);

  const simInput = useMemo(
    () => ({ voltage, switchClosed, bulbCount, wiring, bulbs }),
    [voltage, switchClosed, bulbCount, wiring, bulbs]
  );

  // ------------------------------------------------------------ audio/haptics
  const sound = useCircuitSound();
  const onBurnout = useCallback(
    (_bulbIndex: number) => {
      sound.playSpark();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    },
    [sound]
  );

  const { result, elapsed, flicker, anyBurnedOut, reset } = useCircuitSim({
    input: simInput,
    onBurnout,
  });

  useEffect(() => {
    sound.setFlow(switchClosed ? result.totalCurrent : 0);
  }, [switchClosed, result.totalCurrent, sound]);

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
  const liveStats: Stat[] = useMemo(
    () =>
      result.bulbs.map((bulb, i) => ({
        key: `bulb${i}`,
        label: precise_
          ? t('circuits.stats.currentOf', { name: bulbLabel(i) })
          : t('circuits.stats.brightnessOf', { name: bulbLabel(i) }),
        value: precise_ ? bulb.current : bulb.brightness * 100,
        unit: precise_ ? 'A' : '%',
        fill: bulb.brightness,
        tone: i === 1 ? colors.blue : colors.amber,
        caption: bulb.burnedOut
          ? t('circuits.stats.burnedOut')
          : switchClosed && bulb.current <= 1e-6
            ? t('circuits.stats.noCurrent')
            : undefined,
      })),
    [result.bulbs, precise_, switchClosed, t, bulbLabel]
  );

  const liveDetails: DetailRow[] = useMemo(() => {
    if (!detailed) return [];
    const rows: DetailRow[] = [
      { label: t('circuits.details.voltage'), value: precise(voltage, 2), unit: 'V' },
      {
        label: t('circuits.details.totalResistance'),
        value: Number.isFinite(result.totalResistance) ? precise(result.totalResistance, 2) : '∞',
        unit: Number.isFinite(result.totalResistance) ? 'Ω' : '',
      },
      { label: t('circuits.details.totalCurrent'), value: precise(result.totalCurrent, 3), unit: 'A' },
      { label: t('circuits.details.totalPower'), value: precise(result.totalPower, 2), unit: 'W' },
    ];
    result.bulbs.forEach((bulb, i) => {
      const name = bulbLabel(i);
      rows.push(
        { label: t('circuits.details.resistanceOf', { name }), value: precise(bulb.resistance, 1), unit: 'Ω' },
        { label: t('circuits.details.voltageOf', { name }), value: precise(bulb.voltage, 2), unit: 'V' },
        { label: t('circuits.details.currentOf', { name }), value: precise(bulb.current, 3), unit: 'A' },
        { label: t('circuits.details.powerOf', { name }), value: precise(bulb.power, 2), unit: 'W' }
      );
    });
    return rows;
  }, [detailed, voltage, result, t, bulbLabel]);

  const message = useMemo(() => {
    if (!switchClosed) return t('circuits.messages.switchOpen');

    const burnedIdx = result.bulbs
      .map((b, i) => (b.burnedOut ? i : -1))
      .filter((i) => i >= 0);
    if (burnedIdx.length === result.bulbs.length && burnedIdx.length > 0) {
      return bulbCount === 2
        ? t('circuits.messages.bothBurnedOut')
        : t('circuits.messages.oneBurnedOut', { name: bulbLabel(0) });
    }
    if (burnedIdx.length > 0) {
      return t('circuits.messages.oneBurnedOut', { name: bulbLabel(burnedIdx[0]) });
    }

    if (result.totalCurrent <= 1e-6) return t('circuits.messages.noCurrent');

    const brightest = Math.max(...result.bulbs.map((b) => b.brightness));
    const key = brightest > 0.75 ? 'bright' : brightest > 0.3 ? 'glowing' : 'dim';
    return t(`circuits.messages.${key}`);
  }, [switchClosed, result.bulbs, result.totalCurrent, bulbCount, t, bulbLabel]);

  return (
    <View style={styles.screen}>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvas.width > 0 ? (
          <CircuitScene
            width={canvas.width}
            height={canvas.height}
            bulbCount={bulbCount}
            wiring={wiring}
            switchClosed={switchClosed}
            result={result}
            flicker={flicker}
            elapsed={elapsed}
          />
        ) : null}
        <View style={[styles.badge, { pointerEvents: 'none' }]}>
          <Text style={styles.badgeText}>
            {bulbCount === 1
              ? t('circuits.bulbCount.one')
              : t(`circuits.wiring.${wiring}`)}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        <LevelBlurb module="circuits" />

        <Readout stats={liveStats} details={liveDetails} message={message} />

        <Card title={t('circuits.cards.battery')}>
          <NumberField
            label={t('circuits.sliders.voltage')}
            value={voltage}
            min={LIMITS.voltageMin}
            max={LIMITS.voltageMax}
            unit="V"
            decimals={1}
            onCommit={setVoltage}
          />
        </Card>

        <Card title={t('circuits.cards.bulbs')}>
          <Text style={styles.subLabel}>{t('circuits.bulbCountLabel')}</Text>
          <Segmented
            options={[
              { value: '1', label: t('circuits.bulbCount.one') },
              { value: '2', label: t('circuits.bulbCount.two') },
            ]}
            value={bulbCountStr}
            onChange={setBulbCountStr}
            compact
          />

          {bulbCount === 2 ? (
            <View style={styles.wiringBlock}>
              <Text style={styles.subLabel}>{t('circuits.wiringLabel')}</Text>
              <Segmented<WiringMode>
                options={WIRING_IDS.map((id) => ({ value: id, label: t(`circuits.wiring.${id}`) }))}
                value={wiring}
                onChange={setWiring}
                compact
              />
              <Text style={styles.hint}>{t('circuits.wiringHint')}</Text>
            </View>
          ) : null}

          <View style={styles.resistanceBlock}>
            <NumberField
              label={t('circuits.sliders.resistanceOf', { name: bulbLabel(0) })}
              value={resistanceA}
              min={LIMITS.resistanceMin}
              max={LIMITS.resistanceMax}
              unit="Ω"
              decimals={0}
              onCommit={setResistanceA}
            />
            {bulbCount === 2 ? (
              <NumberField
                label={t('circuits.sliders.resistanceOf', { name: bulbLabel(1) })}
                value={resistanceB}
                min={LIMITS.resistanceMin}
                max={LIMITS.resistanceMax}
                unit="Ω"
                decimals={0}
                onCommit={setResistanceB}
              />
            ) : null}
          </View>

          {anyBurnedOut ? (
            <Pressable onPress={reset} style={styles.replaceRow}>
              <Text style={styles.replaceText}>{t('circuits.replaceBulb')}</Text>
            </Pressable>
          ) : null}
        </Card>

        <Card title={t('circuits.cards.switch')}>
          <Toggle
            label={t('circuits.toggles.switch')}
            description={switchClosed ? t('circuits.toggles.switchOn') : t('circuits.toggles.switchOff')}
            value={switchClosed}
            onChange={setSwitchClosed}
          />
        </Card>

        <FormulaPanel module="circuits" />

        <Text style={styles.credits}>{t('circuits.credits')}</Text>
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
  wiringBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },
  hint: { color: colors.textFaint, fontSize: 11, marginTop: spacing.xs },
  resistanceBlock: { marginTop: spacing.md },

  replaceRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.strokeSoft,
  },
  replaceText: { color: colors.accent, fontSize: 13, fontWeight: '700' },

  credits: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
});
