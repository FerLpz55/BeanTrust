// BeanTrust · Purga de evidencia PENDIENTE huérfana (ADR-14, §6)
//
// La invoca el cron `purge-staged-evidence-daily` (migración 007) con el
// secreto interno. No valida lotes, usuarios, roles, hashes ni pagos: solo
// elimina del bucket los objetos PENDIENTE que nunca se adjuntaron a un lote
// y marca su fila como ELIMINADA. Devuelve únicamente conteos.

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = Deno.env.get("EVIDENCE_BUCKET") ?? "evidencias-lotes";
const TTL_HOURS = Number(Deno.env.get("EVIDENCE_TTL_HOURS") ?? "24");

Deno.serve(async (req: Request): Promise<Response> => {
  // Secreto interno: el cron lo envía en el header Authorization.
  const secreto = Deno.env.get("PURGE_EVIDENCE_SECRET") ?? "";
  const autorizacion = req.headers.get("Authorization") ?? "";
  if (!secreto || autorizacion !== `Bearer ${secreto}`) {
    return new Response(JSON.stringify({ error: "no autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const corte = new Date(Date.now() - TTL_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("evidencias")
    .select("id, storage_key")
    .eq("estado", "PENDIENTE")
    .lt("creado_en", corte);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let eliminadas = 0;
  for (const fila of data ?? []) {
    const { error: errorStorage } = await supabase.storage
      .from(BUCKET)
      .remove([fila.storage_key]);
    // Si el objeto ya no estaba, se marca igual: el objetivo es no dejar
    // metadata colgando apuntando a un binario que no existe.
    if (!errorStorage) eliminadas += 1;
    await supabase
      .from("evidencias")
      .update({ estado: "ELIMINADA" })
      .eq("id", fila.id);
  }

  return new Response(
    JSON.stringify({ pendientes: data?.length ?? 0, eliminadas }),
    { headers: { "Content-Type": "application/json" } },
  );
});
