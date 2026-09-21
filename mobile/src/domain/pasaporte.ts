/**
 * Reglas de presentación del Pasaporte de Café (puras y testeables).
 *
 * El store conserva el pasaporte visible durante un refresco (`isLoading`
 * vuelve a `true` pero `data` sigue ahí). La pantalla **no** debe reemplazar el
 * contenido por el loader de pantalla completa en ese caso: solo en la carga
 * inicial, cuando aún no hay datos.
 */

export function esCargaInicialPasaporte(
  tieneDatos: boolean,
  cargando: boolean,
  hayError: boolean,
): boolean {
  if (tieneDatos) return false;
  return cargando || !hayError;
}
