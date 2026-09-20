/**
 * Registro de limpiezas de sesión (sin dependencias de React Native).
 *
 * Los stores registran aquí cómo vaciar su estado al cerrar sesión; el store de
 * auth ejecuta todas las limpiezas en `logout`. Vive en un módulo propio para
 * que los stores que solo necesitan registrar no importen `store/auth` (que
 * arrastra almacenamiento seguro y React Native).
 */

type LimpiezaSesion = (usuarioId: string | null) => void | Promise<void>;

const limpiezas: LimpiezaSesion[] = [];

export function registrarLimpiezaSesion(limpieza: LimpiezaSesion): void {
  limpiezas.push(limpieza);
}

/** Ejecuta todas las limpiezas; un fallo aislado no impide cerrar sesión. */
export async function ejecutarLimpiezasSesion(usuarioId: string | null): Promise<void> {
  for (const limpieza of limpiezas) {
    try {
      await limpieza(usuarioId);
    } catch {
      // La limpieza de un store no debe impedir cerrar sesión.
    }
  }
}
