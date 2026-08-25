/**
 * Claves de idempotencia (§6).
 *
 * El backend exige un UUID en el header `Idempotency-Key` para los POST de
 * operación (eventos, pagos, propinas) y acepta un `id` generado en el móvil
 * para el alta de lotes. Una misma intención del usuario debe reusar la misma
 * clave en todos sus reintentos: por eso se genera al iniciar la intención y
 * no en cada envío.
 */

import * as Crypto from 'expo-crypto';

export function nuevaClaveIdempotencia(): string {
  return Crypto.randomUUID();
}
