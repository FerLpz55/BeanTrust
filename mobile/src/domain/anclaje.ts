/**
 * Reglas de presentación del anclaje on-chain (ADR-11), puras y testeables.
 */

export const ESTADOS_ANCLAJE_EN_CURSO = ['PENDIENTE', 'ENVIANDO', 'ENVIADA'] as const;

export type EstadoAnclaje = (typeof ESTADOS_ANCLAJE_EN_CURSO)[number] | 'CONFIRMADA' | 'FALLIDA';

/**
 * El Pasaporte debe refrescarse solo mientras el anclaje puede cambiar de
 * estado. En `CONFIRMADA`/`FALLIDA` el polling se detiene.
 */
export function debeConsultarAnclaje(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return (ESTADOS_ANCLAJE_EN_CURSO as readonly string[]).includes(estado);
}
