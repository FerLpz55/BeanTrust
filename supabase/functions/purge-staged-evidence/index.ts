// BeanTrust · Purga de evidencia PENDIENTE huérfana (ADR-14, §6)
//
// La invoca el cron `purge-staged-evidence-daily` (migración 007) con el
// secreto interno. No valida lotes, usuarios, roles, hashes ni pagos: solo
// elimina del bucket los objetos PENDIENTE que nunca se adjuntaron a un lote.
//
// Reglas de seguridad de datos:
//   - Procesa en lotes acotados (100 por defecto) para no bloquear.
//   - Marca ELIMINADA SOLO después de borrar el objeto; si el objeto ya no
//     existe se trata como éxito idempotente.
//   - Ante fallo de Storage o del UPDATE, la fila se queda PENDIENTE y se
//     devuelve 500 para que el cron lo registre y reintente al día siguiente.
//   - Devuelve solo conteos, nunca rutas ni usuarios.

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = Deno.env.get("EVIDENCE_BUCKET") ?? "evidencias-lotes";
const TTL_HOURS = Number(Deno.env.get("EVIDENCE_TTL_HOURS") ?? "24");
const LOTE = Number(Deno.env.get("EVIDENCE_PURGE_BATCH") ?? "100");
const MAX_LOTES = Number(Deno.env.get("EVIDENCE_PURGE_MAX_BATCHES") ?? "50");

export interface PurgaOpciones {
  bucket: string;
  ttlHoras: number;
  lote: number;
  maxLotes: number;
}

export interface PurgaResultado {
  pendientes: number;
  eliminadas: number;
  errores: number;
}

interface FilaPendiente {
  id: string;
  storage_key: string;
  creado_en: string;
}

function objetoAusente(error: { message?: string } | null): boolean {
  const mensaje = (error?.message ?? "").toLowerCase();
  return (
    mensaje.includes("not found") ||
    mensaje.includes("does not exist") ||
    mensaje.includes("no such")
  );
}

/**
 * Purga los objetos PENDIENTE anteriores al TTL. Recibe el cliente inyectado
 * para poder probarse sin red.
 */
// El cliente de Supabase se usa de forma estructural y se inyecta en tests.
// deno-lint-ignore no-explicit-any
export async function purgar(cliente: any, opciones: PurgaOpciones): Promise<PurgaResultado> {
  const corte = new Date(Date.now() - opciones.ttlHoras * 3_600_000).toISOString();
  const resultado: PurgaResultado = { pendientes: 0, eliminadas: 0, errores: 0 };
  let cursor: string | null = null;

  for (let iteracion = 0; iteracion < opciones.maxLotes; iteracion += 1) {
    let consulta = cliente
      .from("evidencias")
      .select("id, storage_key, creado_en")
      .eq("estado", "PENDIENTE")
      .lt("creado_en", corte)
      .order("creado_en", { ascending: true })
      .limit(opciones.lote);
    if (cursor !== null) {
      consulta = consulta.gt("creado_en", cursor);
    }

    const { data, error } = await consulta;
    if (error) {
      throw new Error(error.message);
    }
    const filas = (data ?? []) as FilaPendiente[];
    if (filas.length === 0) {
      break;
    }
    resultado.pendientes += filas.length;

    for (const fila of filas) {
      const { error: errorStorage } = await cliente.storage
        .from(opciones.bucket)
        .remove([fila.storage_key]);
      if (errorStorage && !objetoAusente(errorStorage)) {
        resultado.errores += 1;
        continue;
      }
      const { error: errorUpdate } = await cliente
        .from("evidencias")
        .update({ estado: "ELIMINADA" })
        .eq("id", fila.id);
      if (errorUpdate) {
        resultado.errores += 1;
        continue;
      }
      resultado.eliminadas += 1;
    }

    cursor = filas[filas.length - 1].creado_en;
    if (filas.length < opciones.lote) {
      break;
    }
  }

  return resultado;
}

async function handler(req: Request): Promise<Response> {
  const secreto = Deno.env.get("PURGE_EVIDENCE_SECRET") ?? "";
  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return new Response(JSON.stringify({ error: "no autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cliente = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resultado = await purgar(cliente, {
      bucket: BUCKET,
      ttlHoras: TTL_HOURS,
      lote: LOTE,
      maxLotes: MAX_LOTES,
    });
    return new Response(JSON.stringify(resultado), {
      status: resultado.errores > 0 ? 500 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handler);
}
