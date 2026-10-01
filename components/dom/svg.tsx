import type { ReactNode, SVGProps } from 'react';

/**
 * Short names for the SVG elements the scenes draw with, so a drawing reads
 * `<Circle …/>` and the elements import the same way the rest of the UI does.
 */

type P<T> = SVGProps<T>;

export default function Svg(props: P<SVGSVGElement>) {
  return <svg {...props} />;
}

export const Circle = (p: P<SVGCircleElement>) => <circle {...p} />;
export const Ellipse = (p: P<SVGEllipseElement>) => <ellipse {...p} />;
export const Line = (p: P<SVGLineElement>) => <line {...p} />;
export const Path = (p: P<SVGPathElement>) => <path {...p} />;
export const Rect = (p: P<SVGRectElement>) => <rect {...p} />;
export const Polygon = (p: P<SVGPolygonElement>) => <polygon {...p} />;
export const Polyline = (p: P<SVGPolylineElement>) => <polyline {...p} />;
export const G = (p: P<SVGGElement>) => <g {...p} />;
export const Defs = (p: { children?: ReactNode }) => <defs {...p} />;
export const Stop = (p: P<SVGStopElement>) => <stop {...p} />;
export const ClipPath = (p: P<SVGClipPathElement>) => <clipPath {...p} />;
export const LinearGradient = (p: P<SVGLinearGradientElement>) => <linearGradient {...p} />;
export const RadialGradient = (p: P<SVGRadialGradientElement>) => <radialGradient {...p} />;
export const SvgText = (p: P<SVGTextElement>) => <text {...p} />;
