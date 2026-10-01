'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  type AriaRole,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';

import { toCss, type StyleProp } from './style';

/**
 * The layout primitives every screen is built from.
 *
 * They render ordinary DOM elements. What they add is a column-flex default
 * (so `View` lays children out top to bottom, as the screens assume),
 * `onLayout` backed by a ResizeObserver, and a `Pressable` that can be
 * operated from the keyboard.
 */

export interface LayoutEvent {
  nativeEvent: { layout: { x: number; y: number; width: number; height: number } };
}

interface A11yProps {
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: {
    selected?: boolean;
    disabled?: boolean;
    checked?: boolean;
    expanded?: boolean;
  };
}

function aria(p: A11yProps): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.accessibilityRole && p.accessibilityRole !== 'none') {
    out.role = p.accessibilityRole as AriaRole;
  }
  if (p.accessibilityLabel) out['aria-label'] = p.accessibilityLabel;
  if (p.accessibilityHint) out['aria-description'] = p.accessibilityHint;
  const st = p.accessibilityState;
  if (st) {
    if (st.selected !== undefined) {
      // role=radio uses aria-checked; the rest use aria-selected.
      if (p.accessibilityRole === 'radio') out['aria-checked'] = st.selected;
      else out['aria-selected'] = st.selected;
    }
    if (st.checked !== undefined) out['aria-checked'] = st.checked;
    if (st.disabled !== undefined) out['aria-disabled'] = st.disabled;
    if (st.expanded !== undefined) out['aria-expanded'] = st.expanded;
  }
  return out;
}

/** Reports size changes of an element, once on mount and again on every resize. */
function useLayout(onLayout: ((e: LayoutEvent) => void) | undefined) {
  const node = useRef<HTMLElement | null>(null);
  const cb = useRef(onLayout);
  cb.current = onLayout;
  const watching = onLayout !== undefined;

  useEffect(() => {
    const el = node.current;
    if (!watching || !el || typeof ResizeObserver === 'undefined') return;
    const report = () => {
      cb.current?.({
        nativeEvent: {
          layout: {
            x: el.offsetLeft,
            y: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight,
          },
        },
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [watching]);

  return node;
}

function assign<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

// ------------------------------------------------------------------ View ----

const VIEW_BASE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  boxSizing: 'border-box',
  minWidth: 0,
  minHeight: 0,
  flexShrink: 0,
  alignItems: 'stretch',
  alignContent: 'flex-start',
};

export interface ViewProps extends A11yProps {
  style?: StyleProp;
  children?: ReactNode;
  onLayout?: (e: LayoutEvent) => void;
  id?: string;
}

export const View = forwardRef<HTMLDivElement, ViewProps>(function View(
  { style, children, onLayout, id, ...a11y },
  ref
) {
  const node = useLayout(onLayout);
  return (
    <div
      id={id}
      ref={(el) => {
        node.current = el;
        assign(ref, el);
      }}
      style={{ ...VIEW_BASE, ...toCss(style) }}
      {...aria(a11y)}
    >
      {children}
    </div>
  );
});

// ------------------------------------------------------------------ Text ----

const InsideText = createContext(false);

export interface TextProps extends A11yProps {
  style?: StyleProp;
  children?: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
}

export function Text({ style, children, numberOfLines, selectable, ...a11y }: TextProps) {
  const nested = useContext(InsideText);
  const base: CSSProperties = {
    display: nested ? 'inline' : 'block',
    margin: 0,
    boxSizing: 'border-box',
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    ...(selectable ? { userSelect: 'text' as const } : null),
  };
  const clamp: CSSProperties =
    numberOfLines !== undefined
      ? {
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: numberOfLines,
          overflow: 'hidden',
        }
      : {};
  return (
    <InsideText.Provider value>
      <span style={{ ...base, ...clamp, ...toCss(style) }} {...aria(a11y)}>
        {children}
      </span>
    </InsideText.Provider>
  );
}

// ------------------------------------------------------------- Pressable ----

export interface PressableProps extends A11yProps {
  style?: StyleProp;
  children?: ReactNode;
  disabled?: boolean;
  onPress?: (e: MouseEvent | KeyboardEvent) => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}

export function Pressable({
  style,
  children,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  ...a11y
}: PressableProps) {
  const isDisabled = disabled ?? a11y.accessibilityState?.disabled ?? false;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled || e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPressIn?.();
      onPress?.(e);
      onPressOut?.();
    }
  };

  return (
    <div
      tabIndex={isDisabled ? -1 : 0}
      onClick={isDisabled ? undefined : onPress}
      onPointerDown={isDisabled ? undefined : onPressIn}
      onPointerUp={isDisabled ? undefined : onPressOut}
      onPointerLeave={isDisabled ? undefined : onPressOut}
      onPointerCancel={isDisabled ? undefined : onPressOut}
      onKeyDown={onKeyDown}
      style={{
        ...VIEW_BASE,
        cursor: isDisabled ? 'default' : 'pointer',
        userSelect: 'none',
        touchAction: 'manipulation',
        ...toCss(style),
      }}
      {...aria({ ...a11y, accessibilityRole })}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------ ScrollView ----

export interface ScrollViewProps {
  style?: StyleProp;
  contentContainerStyle?: StyleProp;
  children?: ReactNode;
  horizontal?: boolean;
  onLayout?: (e: LayoutEvent) => void;
}

/** Page width for content: wide enough for the simulations, narrow enough to read. */
const CONTENT_MAX_WIDTH = 860;

export function ScrollView({
  style,
  contentContainerStyle,
  children,
  horizontal,
  onLayout,
}: ScrollViewProps) {
  const content = useLayout(onLayout);
  return (
    <div
      style={{
        ...VIEW_BASE,
        flex: '1 1 0%',
        flexDirection: horizontal ? 'row' : 'column',
        overflowX: horizontal ? 'auto' : 'hidden',
        overflowY: horizontal ? 'hidden' : 'auto',
        ...toCss(style),
      }}
    >
      <div
        ref={(el) => {
          content.current = el;
        }}
        style={{
          ...VIEW_BASE,
          flexDirection: horizontal ? 'row' : 'column',
          width: '100%',
          maxWidth: horizontal ? undefined : CONTENT_MAX_WIDTH,
          marginLeft: horizontal ? undefined : 'auto',
          marginRight: horizontal ? undefined : 'auto',
          flexGrow: 1,
          ...toCss(contentContainerStyle),
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- TextInput ----

export type TextInput = HTMLInputElement;

export interface TextInputProps extends A11yProps {
  value?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'decimal-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: string;
  maxLength?: number;
  editable?: boolean;
  selectTextOnFocus?: boolean;
  style?: StyleProp;
}

const INPUT_MODE: Record<string, InputHTMLAttributes<HTMLInputElement>['inputMode']> = {
  numeric: 'numeric',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    value,
    defaultValue,
    onChangeText,
    onBlur,
    onFocus,
    onSubmitEditing,
    placeholder,
    placeholderTextColor,
    secureTextEntry,
    keyboardType = 'default',
    autoCapitalize,
    autoCorrect,
    autoComplete,
    maxLength,
    editable = true,
    selectTextOnFocus,
    style,
    ...a11y
  },
  ref
) {
  return (
    <input
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      onChange={(e) => onChangeText?.(e.target.value)}
      onBlur={onBlur}
      onFocus={(e) => {
        if (selectTextOnFocus) e.target.select();
        onFocus?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSubmitEditing?.();
      }}
      placeholder={placeholder}
      type={secureTextEntry ? 'password' : keyboardType === 'email-address' ? 'email' : 'text'}
      inputMode={INPUT_MODE[keyboardType]}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      maxLength={maxLength}
      readOnly={!editable}
      spellCheck={autoCorrect === false ? false : undefined}
      style={
        {
          boxSizing: 'border-box',
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          font: 'inherit',
          color: 'inherit',
          padding: 0,
          margin: 0,
          '--placeholder-color': placeholderTextColor,
          ...toCss(style),
        } as CSSProperties
      }
      {...aria(a11y)}
    />
  );
});
