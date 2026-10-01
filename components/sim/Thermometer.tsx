import { StyleSheet, Text, View } from '../dom/index';
import Svg, { Circle, G, Line, Rect, SvgText } from '../dom/svg';
import { heatColor } from '../../lib/matter/colors';
import { heatLevel, temperatureWindow, type Substance } from '../../lib/physics/thermo';
import { colors } from '../../theme';

interface Props {
  height: number;
  substance: Substance;
  /** °C */
  temperature: number;
  /** The reading, already formatted for the reader's level, e.g. "-20 °C". */
  valueText: string;
  /** Short captions for the two marks on the scale, already translated. */
  meltText: string;
  boilText: string;
}

const WIDTH = 92;
const TUBE_X = 24;
const TUBE_W = 12;
const BULB_R = 13;

/**
 * A glass thermometer with a mark at the melting and at the boiling point, so
 * the plateaus on the graph have a place on the scale too.
 */
export function Thermometer({ height, substance, temperature, valueText, meltText, boilText }: Props) {
  const top = 14;
  const bulbY = height - 48 - BULB_R;
  const tubeBottom = bulbY - BULB_R + 3;
  const tubeH = Math.max(tubeBottom - top, 20);

  const { low, high } = temperatureWindow(substance);
  const yFor = (T: number) => tubeBottom - ((T - low) / (high - low)) * tubeH;

  const level = heatLevel(substance, temperature);
  const mercuryTop = Math.min(tubeBottom, Math.max(top, yFor(temperature)));
  const color = heatColor(level);

  const marks = [
    { T: substance.meltingPoint, text: meltText },
    { T: substance.boilingPoint, text: boilText },
  ];

  return (
    <View style={{ width: WIDTH, alignItems: 'center' }}>
      <Svg width={WIDTH} height={height}>
        {/* Glass */}
        <Rect
          x={TUBE_X - 3}
          y={top - 4}
          width={TUBE_W + 6}
          height={tubeBottom - top + 8}
          rx={(TUBE_W + 6) / 2}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(190,210,240,0.35)"
          strokeWidth={1.5}
        />
        <Circle
          cx={TUBE_X + TUBE_W / 2}
          cy={bulbY}
          r={BULB_R + 3}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(190,210,240,0.35)"
          strokeWidth={1.5}
        />
        {/* Mercury */}
        <Circle cx={TUBE_X + TUBE_W / 2} cy={bulbY} r={BULB_R} fill={color} />
        <Rect
          x={TUBE_X + 2}
          y={mercuryTop}
          width={TUBE_W - 4}
          height={Math.max(0, bulbY - mercuryTop)}
          fill={color}
          style={{ transition: 'y 90ms linear, height 90ms linear, fill 200ms linear' }}
        />
        <Circle cx={TUBE_X + TUBE_W / 2 - 4} cy={bulbY - 4} r={3.2} fill="rgba(255,255,255,0.45)" />

        {/* Marks at the two phase changes */}
        {marks.map((m) => {
          const y = yFor(m.T);
          return (
            <G key={m.text}>
              <Line
                x1={TUBE_X + TUBE_W + 4}
                x2={TUBE_X + TUBE_W + 12}
                y1={y}
                y2={y}
                stroke={colors.textMuted}
                strokeWidth={1.4}
              />
              <SvgText x={TUBE_X + TUBE_W + 16} y={y - 1} fill={colors.textMuted} fontSize={9} fontWeight="700">
                {m.text}
              </SvgText>
              <SvgText x={TUBE_X + TUBE_W + 16} y={y + 10} fill={colors.textFaint} fontSize={9}>
                {`${formatMark(m.T)}°`}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Text style={[styles.value, { color }]}>{valueText}</Text>
    </View>
  );
}

function formatMark(v: number): string {
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

const styles = StyleSheet.create({
  value: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    fontVariantNumeric: 'tabular-nums',
  },
});
