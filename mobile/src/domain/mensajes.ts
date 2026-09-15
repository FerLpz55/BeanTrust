/**
 * Mensajes de confirmación del modo campo (§7.5).
 *
 * Cuando la operación se encoló offline nunca se afirma que el backend la
 * confirmó: se dice que quedó guardada en el dispositivo y pendiente de
 * sincronizar. Estos textos se prueban en `mensajes.test.ts`.
 */

export function tituloCosecha(pendiente: boolean): string {
  return pendiente ? 'Guardado en este dispositivo' : 'Lote registrado';
}

export function detalleCosecha(pendiente: boolean): string {
  return pendiente
    ? 'Pendiente de sincronizar; se enviará automáticamente cuando recuperes conexión.'
    : 'Tu cosecha ha sido registrada exitosamente.';
}

export function tituloEvento(pendiente: boolean): string {
  return pendiente ? 'Evento guardado en este dispositivo' : 'Evento registrado';
}

export function detalleEvento(tipo: string, pendiente: boolean): string {
  return pendiente
    ? `${tipo} pendiente de sincronizar; se enviará cuando recuperes conexión.`
    : 'Ya quedó en la trazabilidad del lote, con su hash de etapa.';
}
