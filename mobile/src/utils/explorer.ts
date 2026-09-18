/**
 * Enlaces al explorador de bloques (ADR-11).
 *
 * El Pasaporte público solo debe abrir el explorador oficial de la red
 * configurada, sobre HTTPS y con el host exacto. Cualquier otra URL (por
 * ejemplo, una inyectada en la respuesta) se descarta antes de llamar a
 * `Linking`, evitando abrir esquemas o dominios no confiables.
 */

export const EXPLORER_HOST_PERMITIDO = 'sepolia.basescan.org';

/** `true` solo para `https://sepolia.basescan.org/...` (host exacto). */
export function esUrlExplorerPermitida(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && parsed.hostname === EXPLORER_HOST_PERMITIDO;
}
