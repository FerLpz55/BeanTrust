/**
 * Íconos de línea a medida para las estadísticas del dashboard ("Copa de
 * cata"): mismo lenguaje visual que el sello de BrandMark (trazo, sin
 * relleno, geometría simple) en vez de glifos genéricos de Material Icons.
 */

import { Circle, Line, Path, Svg } from 'react-native-svg';

interface StatIconProps {
  size?: number;
  color: string;
}

const STROKE_WIDTH = 1.6;

/** Cerezas de café — para "Lotes activos". */
export function CherryIcon({ size = 24, color }: StatIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 11c0-4 2-6.5 4-6.5M15.5 10c0-3-1.5-4.5-2.5-5.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <Path
        d="M13 4.5c1.5-1.5 3.5-1.3 4 0-1.5 1-3 .5-4 0Z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <Circle cx="9" cy="15.5" r="4.3" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Circle cx="15.5" cy="14" r="3.8" stroke={color} strokeWidth={STROKE_WIDTH} />
    </Svg>
  );
}

/** Balanza — para "Peso total" (reemplaza el ícono de billetera que no tenía sentido con kg). */
export function ScaleIcon({ size = 24, color }: StatIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="12" y1="4" x2="12" y2="19" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Line x1="8" y1="21" x2="16" y2="21" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Line x1="5" y1="7" x2="19" y2="7" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M5 7 2.5 11.5M5 7 7.5 11.5" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Path d="M19 7 16.5 11.5M19 7 21.5 11.5" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Svg>
  );
}

/** Medalla con cinta — para "Certificados", eco directo del sello de la marca. */
export function SealIcon({ size = 24, color }: StatIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 13 7 21 11 18.7Z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
      <Path d="M15 13 17 21 13 18.7Z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
      <Circle cx="12" cy="9" r="5" stroke={color} strokeWidth={STROKE_WIDTH} />
      <Path d="M9.7 9.2 11 10.5 14.3 7.3" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Puesto de mercado — para "En mercado". */
export function StallIcon({ size = 24, color }: StatIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8 12 4 20 8Z" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinejoin="round" />
      <Line x1="6" y1="8" x2="6" y2="19" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Line x1="18" y1="8" x2="18" y2="19" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Line x1="5" y1="15" x2="19" y2="15" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
      <Line x1="5" y1="19" x2="19" y2="19" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
    </Svg>
  );
}
