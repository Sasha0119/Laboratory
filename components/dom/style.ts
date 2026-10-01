import type { CSSProperties } from 'react';

/**
 * Style objects for the layout primitives.
 *
 * The screens describe layout with the same vocabulary they always have —
 * `paddingHorizontal`, a numeric `lineHeight`, `flex: 1` — and `toCss` turns
 * that into plain CSS. The only things to know are the places where a bare
 * number means something different in CSS than it does here:
 *
 *   lineHeight   a number is pixels here, a multiplier in CSS
 *   flex         `flex: 1` means "grow and shrink from zero basis"
 *   borders      a width with no `borderStyle` still draws a solid line, and
 *                a side with no width gets none
 */
export interface Style extends CSSProperties {
  paddingHorizontal?: number | string;
  paddingVertical?: number | string;
  marginHorizontal?: number | string;
  marginVertical?: number | string;
}

export type StyleProp = Style | false | null | undefined | StyleProp[];

const BORDER_WIDTHS = [
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

function flatten(style: StyleProp, out: Style = {}): Style {
  if (!style) return out;
  if (Array.isArray(style)) {
    for (const item of style) flatten(item, out);
    return out;
  }
  return Object.assign(out, style);
}

export function toCss(style: StyleProp): CSSProperties {
  const s = flatten(style) as Record<string, unknown>;
  const css: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) continue;
    switch (key) {
      case 'paddingHorizontal':
        css.paddingLeft = value;
        css.paddingRight = value;
        break;
      case 'paddingVertical':
        css.paddingTop = value;
        css.paddingBottom = value;
        break;
      case 'marginHorizontal':
        css.marginLeft = value;
        css.marginRight = value;
        break;
      case 'marginVertical':
        css.marginTop = value;
        css.marginBottom = value;
        break;
      case 'lineHeight':
        css.lineHeight = typeof value === 'number' ? `${value}px` : value;
        break;
      case 'flex':
        css.flex = typeof value === 'number' ? `${value} ${value} 0%` : value;
        break;
      default:
        css[key] = value;
    }
  }

  // A width on any side means "draw a border" — but only on the sides that
  // were given one. CSS would give the others its default 3px, so they are
  // set to zero explicitly.
  if (BORDER_WIDTHS.some((k) => s[k] !== undefined)) {
    if (css.borderStyle === undefined) css.borderStyle = 'solid';
    const all = s.borderWidth;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const key = `border${side}Width`;
      css[key] = s[key] ?? all ?? 0;
    }
    delete css.borderWidth;
  }

  return css as CSSProperties;
}

export const StyleSheet = {
  create<T extends Record<string, Style>>(styles: T): T {
    return styles;
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  } as Style,
};
