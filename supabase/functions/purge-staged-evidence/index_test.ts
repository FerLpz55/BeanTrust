// Pruebas de la purga de evidencia (Deno). Ejecutar con:
//   deno test --allow-env --allow-net supabase/functions/purge-staged-evidence/
//
// El cliente de Supabase se inyecta, así que no hace falta red ni credenciales:
// se simulan éxito, fallo de Storage y fallo del UPDATE de metadata.

import { assertEquals } from "jsr:@std/assert@1";
import { purgar } from "./index.ts";

interface Fila {
  id: string;
  storage_key: string;
  creado_en: string;
}

interface Opciones {
  errorStorage?: { message: string } | null;
  errorUpdate?: { message: string } | null;
}

class CadenaFalsa {
  private filas: Fila[];
  private limite: number | null = null;
  private readonly opciones: Opciones;

  constructor(filas: Fila[], opciones: Opciones) {
    this.filas = [...filas];
    this.opciones = opciones;
  }

  select(): this {
    return this;
  }
  eq(): this {
    return this;
  }
  lt(): this {
    return this;
  }
  order(): this {
    return this;
  }
  limit(n: number): this {
    this.limite = n;
    return this;
  }
  gt(columna: keyof Fila, valor: string): this {
    this.filas = this.filas.filter((fila) => fila[columna] > valor);
    return this;
  }

  then(
    resolver: (valor: { data: Fila[]; error: null }) => void,
  ): void {
    const data = this.filas.slice(0, this.limite ?? this.filas.length);
    resolver({ data, error: null });
  }
}

function clienteFalso(filas: Fila[], opciones: Opciones = {}) {
  return {
    from(tabla: string) {
      if (tabla !== "evidencias") {
        throw new Error(`tabla inesperada: ${tabla}`);
      }
      return {
        select: () => new CadenaFalsa(filas, opciones),
        update: () => ({
          eq: () => Promise.resolve({ error: opciones.errorUpdate ?? null }),
        }),
      };
    },
    storage: {
      from() {
        return {
          remove: () =>
            Promise.resolve({
              data: null,
              error: opciones.errorStorage ?? null,
            }),
        };
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

const FILAS: Fila[] = [
  { id: "e1", storage_key: "u/l/e1.jpg", creado_en: "2026-01-01T00:00:00+00:00" },
  { id: "e2", storage_key: "u/l/e2.jpg", creado_en: "2026-01-02T00:00:00+00:00" },
];

const OPCIONES = { bucket: "evidencias-lotes", ttlHoras: 24, lote: 100, maxLotes: 5 };

Deno.test("purga: borra y marca ELIMINADA cuando Storage y UPDATE van bien", async () => {
  const resultado = await purgar(clienteFalso(FILAS), OPCIONES);
  assertEquals(resultado, { pendientes: 2, eliminadas: 2, errores: 0 });
});

Deno.test("purga: si Storage falla, conserva PENDIENTE y acumula error", async () => {
  const resultado = await purgar(
    clienteFalso(FILAS, { errorStorage: { message: "boom" } }),
    OPCIONES,
  );
  assertEquals(resultado, { pendientes: 2, eliminadas: 0, errores: 2 });
});

Deno.test("purga: si el UPDATE de metadata falla, conserva PENDIENTE", async () => {
  const resultado = await purgar(
    clienteFalso(FILAS, { errorUpdate: { message: "boom" } }),
    OPCIONES,
  );
  assertEquals(resultado, { pendientes: 2, eliminadas: 0, errores: 2 });
});

Deno.test("purga: objeto ya ausente cuenta como éxito idempotente", async () => {
  const resultado = await purgar(
    clienteFalso(FILAS, { errorStorage: { message: "Object not found" } }),
    OPCIONES,
  );
  assertEquals(resultado, { pendientes: 2, eliminadas: 2, errores: 0 });
});
