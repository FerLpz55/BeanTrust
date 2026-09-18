"""Repositorios contra Supabase (PostgREST) usando el cliente oficial `supabase`.

Estas implementaciones se activan con `BEAN_REPO_BACKEND=supabase`. La
conexión real se valida en B11; aquí el código queda listo y testeable con un
cliente simulado. `lote_eventos` es append-only: solo `insert` y `select`
(§6), y además la BD lo garantiza con grants + trigger (migraciones B2).
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from postgrest import APIError

from app.models.dominio import (
    AnclaBlockchain,
    CertificadoQR,
    Cooperativa,
    Estado,
    EstadoAncla,
    EstadoEvidencia,
    EstadoPago,
    EstadoPropina,
    Evidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    FencingPerdido,
    Finca,
    Lote,
    LoteEvento,
    NoAutorizado,
    Pago,
    Propina,
    RepoError,
    Rol,
    TipoEvento,
    Usuario,
)
from app.utils.cursor import Cursor


def _dato_unico(resp: Any) -> Any:
    """Fila de un `.maybe_single()`, o `None` si no hubo coincidencia.

    El SDK devuelve `None` en lugar de una respuesta con `data=None` cuando la
    consulta no encuentra fila, así que acceder a `resp.data` a secas revienta
    con AttributeError en todos los "buscar_por_*" que pueden no encontrar nada.
    """
    return getattr(resp, "data", None)


def _uuid(valor: Any) -> uuid.UUID:
    return uuid.UUID(str(valor))


def _dt(valor: Any) -> datetime:
    return datetime.fromisoformat(str(valor))


def _dia(valor: Any) -> date:
    return date.fromisoformat(str(valor))


def _o_none(valor: Any) -> Any:
    return None if valor is None else valor


# SQLSTATE que el RPC `registrar_cosecha_con_evidencia` levanta a propósito
# (migración 008). Cualquier otro código es un fallo de infraestructura.
_ERRORES_RPC_COSECHA: dict[str, type] = {
    "28000": NoAutorizado,
    "42501": NoAutorizado,
    "P0002": EvidenciaNoEncontrada,
    "23505": EvidenciaYaAdjunta,
}

_MENSAJES_RPC_COSECHA: dict[type, str] = {
    NoAutorizado: "La finca o la evidencia no corresponden al usuario.",
    EvidenciaNoEncontrada: "La evidencia no existe.",
    EvidenciaYaAdjunta: "El lote ya existe con datos distintos.",
}


def _misma_evidencia(a: Evidencia, b: Evidencia) -> bool:
    """¿Dos evidencias con el mismo id describen exactamente el mismo objeto?

    Si difieren, el `insert` chocó con la PK de una evidencia ajena y jamás se
    puede sobrescribir: la fila existente es la fuente de verdad.
    """
    return (
        a.uploader_id == b.uploader_id
        and a.finca_id == b.finca_id
        and a.lote_id == b.lote_id
        and a.sha256 == b.sha256
        and a.content_type == b.content_type
        and a.size_bytes == b.size_bytes
    )


# ---------------------------------------------------------------- Lote


def lote_a_fila(lote: Lote) -> dict[str, Any]:
    return {
        "id": str(lote.id),
        "finca_id": str(lote.finca_id),
        "codigo_publico": lote.codigo_publico,
        "estado": lote.estado.value,
        "peso_actual_kg": lote.peso_actual_kg,
        "fecha_cosecha": lote.fecha_cosecha.isoformat(),
        "variedad": lote.variedad,
        "metodo_beneficiado": lote.metodo_beneficiado,
        "evidencia_url": lote.evidencia_url,
        "evidencia_sha256": lote.evidencia_sha256,
        "creado_en": lote.creado_en.isoformat(),
        "actualizado_en": lote.actualizado_en.isoformat(),
    }


def fila_a_lote(fila: dict[str, Any]) -> Lote:
    return Lote(
        id=_uuid(fila["id"]),
        finca_id=_uuid(fila["finca_id"]),
        codigo_publico=fila["codigo_publico"],
        fecha_cosecha=_dia(fila["fecha_cosecha"]),
        estado=Estado(fila["estado"]),
        peso_actual_kg=float(fila["peso_actual_kg"]),
        variedad=_o_none(fila.get("variedad")),
        metodo_beneficiado=_o_none(fila.get("metodo_beneficiado")),
        evidencia_url=_o_none(fila.get("evidencia_url")),
        evidencia_sha256=_o_none(fila.get("evidencia_sha256")),
        creado_en=_dt(fila["creado_en"]),
        actualizado_en=_dt(fila["actualizado_en"]),
    )


def evento_a_fila(evento: LoteEvento) -> dict[str, Any]:
    return {
        "id": str(evento.id),
        "lote_id": str(evento.lote_id),
        "tipo": evento.tipo.value,
        "de_estado": evento.de_estado.value if evento.de_estado else None,
        "a_estado": evento.a_estado.value,
        "actor_id": str(evento.actor_id),
        "peso_kg": evento.peso_kg,
        "merma_pct": evento.merma_pct,
        "comprador_id": str(evento.comprador_id) if evento.comprador_id else None,
        "metodo_beneficiado": evento.metodo_beneficiado,
        "metodo_fermentacion": evento.metodo_fermentacion,
        "fermentacion_horas": evento.fermentacion_horas,
        "humedad_inicial_pct": evento.humedad_inicial_pct,
        "humedad_final_pct": evento.humedad_final_pct,
        "metodo_secado": evento.metodo_secado,
        "dias_reposo": evento.dias_reposo,
        "puntaje_sca": evento.puntaje_sca,
        "defectos": evento.defectos,
        "densidad": evento.densidad,
        "tamiz": evento.tamiz,
        "hash_etapa": evento.hash_etapa,
        "registrado_en": evento.registrado_en.isoformat(),
    }


def fila_a_evento(fila: dict[str, Any]) -> LoteEvento:
    return LoteEvento(
        id=_uuid(fila["id"]),
        lote_id=_uuid(fila["lote_id"]),
        tipo=TipoEvento(fila["tipo"]),
        de_estado=Estado(fila["de_estado"]) if fila.get("de_estado") else None,
        a_estado=Estado(fila["a_estado"]),
        actor_id=_uuid(fila["actor_id"]),
        peso_kg=float(fila["peso_kg"]) if fila.get("peso_kg") is not None else None,
        merma_pct=float(fila["merma_pct"]) if fila.get("merma_pct") is not None else None,
        comprador_id=_uuid(fila["comprador_id"]) if fila.get("comprador_id") else None,
        metodo_beneficiado=_o_none(fila.get("metodo_beneficiado")),
        metodo_fermentacion=_o_none(fila.get("metodo_fermentacion")),
        fermentacion_horas=(
                float(fila["fermentacion_horas"])
                if fila.get("fermentacion_horas") is not None
                else None
            ),
            humedad_inicial_pct=(
                float(fila["humedad_inicial_pct"])
                if fila.get("humedad_inicial_pct") is not None
                else None
            ),
            humedad_final_pct=(
                float(fila["humedad_final_pct"])
                if fila.get("humedad_final_pct") is not None
                else None
            ),
        metodo_secado=_o_none(fila.get("metodo_secado")),
        dias_reposo=float(fila["dias_reposo"]) if fila.get("dias_reposo") is not None else None,
        puntaje_sca=float(fila["puntaje_sca"]) if fila.get("puntaje_sca") is not None else None,
        defectos=_o_none(fila.get("defectos")),
        densidad=float(fila["densidad"]) if fila.get("densidad") is not None else None,
        tamiz=_o_none(fila.get("tamiz")),
        hash_etapa=_o_none(fila.get("hash_etapa")),
        registrado_en=_dt(fila["registrado_en"]),
    )


def qr_a_fila(qr: CertificadoQR) -> dict[str, Any]:
    return {
        "id": str(qr.id),
        "lote_id": str(qr.lote_id),
        "codigo": qr.codigo,
        "hash_sha256": qr.hash_sha256,
        "emitido_en": qr.emitido_en.isoformat(),
    }


def fila_a_qr(fila: dict[str, Any]) -> CertificadoQR:
    return CertificadoQR(
        id=_uuid(fila["id"]),
        lote_id=_uuid(fila["lote_id"]),
        codigo=fila["codigo"],
        hash_sha256=fila["hash_sha256"],
        emitido_en=_dt(fila["emitido_en"]),
    )


def pago_a_fila(pago: Pago) -> dict[str, Any]:
    return {
        "id": str(pago.id),
        "lote_id": str(pago.lote_id),
        "cooperativa_id": str(pago.cooperativa_id),
        "comprador_id": str(pago.comprador_id),
        "monto_total": pago.monto_total,
        "comision_pct": pago.comision_pct,
        "monto_productor": pago.monto_productor,
        "estado_pago": pago.estado_pago.value,
        "tx_hash": pago.tx_hash,
        "idempotency_key": str(pago.idempotency_key) if pago.idempotency_key else None,
        "creado_en": pago.creado_en.isoformat(),
        "confirmado_en": pago.confirmado_en.isoformat() if pago.confirmado_en else None,
    }


def fila_a_pago(fila: dict[str, Any]) -> Pago:
    return Pago(
        id=_uuid(fila["id"]),
        lote_id=_uuid(fila["lote_id"]),
        cooperativa_id=_uuid(fila["cooperativa_id"]),
        comprador_id=_uuid(fila["comprador_id"]),
        monto_total=float(fila["monto_total"]),
        comision_pct=float(fila["comision_pct"]),
        monto_productor=float(fila["monto_productor"]),
        estado_pago=EstadoPago(fila["estado_pago"]),
        tx_hash=_o_none(fila.get("tx_hash")),
        idempotency_key=_uuid(fila["idempotency_key"]) if fila.get("idempotency_key") else None,
        creado_en=_dt(fila["creado_en"]),
        confirmado_en=_dt(fila["confirmado_en"]) if fila.get("confirmado_en") else None,
    )


def fila_a_finca(fila: dict[str, Any]) -> Finca:
    return Finca(
        id=_uuid(fila["id"]),
        productor_id=_uuid(fila["productor_id"]),
        cooperativa_id=_uuid(fila["cooperativa_id"]),
        nombre=fila["nombre"],
        municipio=fila["municipio"],
        organica=bool(fila["organica"]),
        altitud_min=float(fila["altitud_min"]) if fila.get("altitud_min") is not None else None,
        altitud_max=float(fila["altitud_max"]) if fila.get("altitud_max") is not None else None,
    )


def fila_a_usuario(fila: dict[str, Any]) -> Usuario:
    return Usuario(
        id=_uuid(fila["id"]),
        email=fila["email"],
        rol=Rol(fila["rol"]),
        nombre=fila["nombre"],
    )


def fila_a_cooperativa(fila: dict[str, Any]) -> Cooperativa:
    return Cooperativa(
        id=_uuid(fila["id"]),
        nombre=fila["nombre"],
        rfc=_o_none(fila.get("rfc")),
        contacto=_o_none(fila.get("contacto")),
        municipio=_o_none(fila.get("municipio")),
    )


def evidencia_a_fila(evidencia: Evidencia) -> dict[str, Any]:
    return {
        "id": str(evidencia.id),
        "lote_id": str(evidencia.lote_id),
        "finca_id": str(evidencia.finca_id),
        "uploader_id": str(evidencia.uploader_id),
        "storage_key": evidencia.storage_key,
        "sha256": evidencia.sha256,
        "content_type": evidencia.content_type,
        "size_bytes": evidencia.size_bytes,
        "estado": evidencia.estado.value,
        "creado_en": evidencia.creado_en.isoformat(),
        "adjuntada_en": evidencia.adjuntada_en.isoformat() if evidencia.adjuntada_en else None,
    }


def fila_a_evidencia(fila: dict[str, Any]) -> Evidencia:
    return Evidencia(
        id=_uuid(fila["id"]),
        lote_id=_uuid(fila["lote_id"]),
        finca_id=_uuid(fila["finca_id"]),
        uploader_id=_uuid(fila["uploader_id"]),
        storage_key=fila["storage_key"],
        sha256=fila["sha256"],
        content_type=fila["content_type"],
        size_bytes=int(fila["size_bytes"]),
        estado=EstadoEvidencia(fila["estado"]),
        creado_en=_dt(fila["creado_en"]),
        adjuntada_en=_dt(fila["adjuntada_en"]) if fila.get("adjuntada_en") else None,
    )


class SupabaseLoteRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def _certificados(self, lote_ids: list[uuid.UUID]) -> dict[uuid.UUID, CertificadoQR]:
        """Certificados QR de esos lotes, en una sola consulta (evita N+1).

        El repositorio en memoria devuelve el mismo objeto `Lote` que ya traía
        el certificado adjunto, así que nunca hizo falta cargarlo. Contra una BD
        real hay que hidratarlo: sin él la app no puede pintar el QR y, peor,
        `QrService.material_lote` se queda sin el corte por `emitido_en` y el
        certificado deja de verificar en cuanto el lote registra un evento nuevo.
        """
        if not lote_ids:
            return {}
        try:
            resp = (
                self._cliente.table("qr_certificado")
                .select("*")
                .in_("lote_id", [str(lote_id) for lote_id in lote_ids])
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el certificado.") from exc
        certificados = [fila_a_qr(fila) for fila in (resp.data or [])]
        return {qr.lote_id: qr for qr in certificados}

    def _hidratar_certificado(self, lote: Lote) -> Lote:
        lote.certificado = self._certificados([lote.id]).get(lote.id)
        return lote

    def guardar(self, lote: Lote) -> Lote:
        try:
            self._cliente.table("lotes").upsert(lote_a_fila(lote)).execute()
        except APIError as exc:
            raise RepoError("No se pudo guardar el lote.") from exc
        return lote

    def buscar_por_id(self, lote_id: uuid.UUID) -> Lote | None:
        try:
            resp = (
                self._cliente.table("lotes")
                .select("*")
                .eq("id", str(lote_id))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el lote.") from exc
        fila = _dato_unico(resp)
        if not fila:
            return None
        lote = fila_a_lote(fila)
        # Cargar el historial: lo necesita la idempotencia por Idempotency-Key
        # (si un retry llega, buscar_por_id debe ver los eventos ya insertados).
        lote.historial = self.listar_eventos(lote.id)
        return self._hidratar_certificado(lote)

    def buscar_por_codigo(self, codigo: str) -> Lote | None:
        try:
            resp = (
                self._cliente.table("lotes")
                .select("*")
                .eq("codigo_publico", codigo)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el lote.") from exc
        fila = _dato_unico(resp)
        return self._hidratar_certificado(fila_a_lote(fila)) if fila else None

    def listar(self, cursor: Cursor | None, limit: int) -> tuple[list[Lote], Cursor | None]:
        try:
            query = (
                self._cliente.table("lotes")
                .select("*")
                .order("creado_en", desc=True)
                .order("id", desc=True)
                .limit(limit)
            )
            if cursor is not None:
                query = query.lt("creado_en", cursor.ts.isoformat())
            resp = query.execute()
        except APIError as exc:
            raise RepoError("No se pudo listar los lotes.") from exc
        filas = resp.data or []
        lotes = [fila_a_lote(fila) for fila in filas]
        certificados = self._certificados([lote.id for lote in lotes])
        for lote in lotes:
            lote.certificado = certificados.get(lote.id)
        siguiente: Cursor | None = None
        if len(lotes) == limit and lotes:
            ultimo = lotes[-1]
            siguiente = Cursor(id=ultimo.id, ts=ultimo.creado_en)
        return lotes, siguiente

    def adjuntar_evento(self, evento: LoteEvento) -> None:
        try:
            self._cliente.table("lote_eventos").insert(evento_a_fila(evento)).execute()
        except APIError as exc:
            raise RepoError("No se pudo registrar el evento.") from exc

    def listar_eventos(self, lote_id: uuid.UUID) -> list[LoteEvento]:
        """Historial en orden cronológico ascendente.

        El dominio y el repositorio en memoria devuelven la cadena en orden de
        registro; el smoke, el pasaporte público (`reversed`) y el móvil asumen
        ese orden. Ordenar descendente aquí rompía la lectura del evento más
        reciente y el corte de integridad.
        """
        try:
            resp = (
                self._cliente.table("lote_eventos")
                .select("*")
                .eq("lote_id", str(lote_id))
                .order("registrado_en")
                .order("id")
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el historial.") from exc
        return [fila_a_evento(fila) for fila in (resp.data or [])]

    def registrar_cosecha_con_evidencia(
        self,
        lote: Lote,
        evento: LoteEvento,
        evidencia_id: uuid.UUID,
        adjuntada_en: datetime,
    ) -> Lote:
        """Alta atómica lote + evento + evidencia vía RPC `security definer`.

        El hash ya lo calculó el dominio. La RPC valida tenencia e idempotencia;
        aquí solo se traduce su SQLSTATE a errores de dominio y se relee el lote
        (con historial y certificado) para devolver el estado real persistido.
        """
        parametros = {
            "p_lote_id": str(lote.id),
            "p_evento_id": str(evento.id),
            "p_finca_id": str(lote.finca_id),
            "p_codigo_publico": lote.codigo_publico,
            "p_fecha_cosecha": lote.fecha_cosecha.isoformat(),
            "p_peso_kg": evento.peso_kg,
            "p_variedad": lote.variedad,
            "p_metodo_beneficiado": lote.metodo_beneficiado,
            "p_evidencia_id": str(evidencia_id),
            "p_hash_etapa": evento.hash_etapa,
            "p_registrado_en": evento.registrado_en.isoformat(),
        }
        try:
            self._cliente.rpc("registrar_cosecha_con_evidencia", parametros).execute()
        except APIError as exc:
            clase = _ERRORES_RPC_COSECHA.get(getattr(exc, "code", "") or "")
            if clase is None:
                raise RepoError("No se pudo registrar la cosecha con evidencia.") from exc
            # El mensaje del RPC distingue conflicto de lote de evidencia ya
            # adjunta; el mapa queda como respaldo si PostgREST no lo trae.
            mensaje = getattr(exc, "message", None) or _MENSAJES_RPC_COSECHA[clase]
            raise clase(mensaje) from exc

        # Éxito o reintento idempotente: en ambos casos el lote ya está en la BD
        # y se devuelve la fila real, con su historial y su certificado.
        lote_leido = self.buscar_por_id(lote.id)
        if lote_leido is None:
            raise RepoError("La cosecha se registró pero no se pudo releer el lote.")
        return lote_leido


class SupabaseQRRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def guardar_certificado(self, qr: CertificadoQR) -> CertificadoQR:
        try:
            self._cliente.table("qr_certificado").insert(qr_a_fila(qr)).execute()
        except APIError as exc:
            raise RepoError("No se pudo guardar el certificado.") from exc
        return qr

    def buscar_por_codigo(self, codigo: str) -> CertificadoQR | None:
        try:
            resp = (
                self._cliente.table("qr_certificado")
                .select("*")
                .eq("codigo", codigo)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el certificado.") from exc
        return fila_a_qr(_dato_unico(resp)) if _dato_unico(resp) else None

    def registrar_verificacion(self, lote_id: uuid.UUID, dispositivo: str | None) -> None:
        try:
            # `verificacion.id` es uuid PK sin default: lo genera el cliente,
            # como el resto de tablas (§7.5).
            self._cliente.table("verificacion").insert(
                {
                    "id": str(uuid.uuid4()),
                    "lote_id": str(lote_id),
                    "dispositivo": dispositivo,
                }
            ).execute()
        except APIError as exc:
            raise RepoError("No se pudo registrar la verificación.") from exc


class SupabaseEvidenciaRepo:
    """Metadata de evidencias (tabla privada, solo `service_role`)."""

    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def crear(self, evidencia: Evidencia) -> Evidencia:
        """Inserta la fila sin sobrescribir jamás una evidencia existente.

        `insert` (no `upsert`): si la PK ya existe, se lee la fila y solo se
        devuelve cuando describe el mismo objeto (replay idempotente). Si los
        datos difieren, la clave de idempotencia fue reutilizada con otro
        contenido y se responde 409.
        """
        try:
            self._cliente.table("evidencias").insert(evidencia_a_fila(evidencia)).execute()
        except APIError as exc:
            if getattr(exc, "code", "") == "23505":
                existente = self.buscar_por_id(evidencia.id)
                if existente is not None and _misma_evidencia(existente, evidencia):
                    return existente
                raise EvidenciaYaAdjunta(
                    "Ya existe una evidencia con ese id y datos distintos."
                ) from exc
            raise RepoError("No se pudo guardar la evidencia.") from exc
        return evidencia

    def buscar_por_id(self, evidencia_id: uuid.UUID) -> Evidencia | None:
        try:
            resp = (
                self._cliente.table("evidencias")
                .select("*")
                .eq("id", str(evidencia_id))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar la evidencia.") from exc
        fila = _dato_unico(resp)
        return fila_a_evidencia(fila) if fila else None

    def buscar_adjunta_por_lote(self, lote_id: uuid.UUID) -> Evidencia | None:
        try:
            resp = (
                self._cliente.table("evidencias")
                .select("*")
                .eq("lote_id", str(lote_id))
                .eq("estado", EstadoEvidencia.ADJUNTA.value)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar la evidencia.") from exc
        fila = _dato_unico(resp)
        return fila_a_evidencia(fila) if fila else None

    def marcar_adjunta(self, evidencia_id: uuid.UUID, cuando: datetime) -> None:
        try:
            (
                self._cliente.table("evidencias")
                .update(
                    {
                        "estado": EstadoEvidencia.ADJUNTA.value,
                        "adjuntada_en": cuando.isoformat(),
                    }
                )
                .eq("id", str(evidencia_id))
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo marcar la evidencia como adjunta.") from exc


def _listar_paginado(
    cliente,
    tabla: str,
    columna: str,
    valor: uuid.UUID,
    cursor: Cursor | None,
    limit: int,
    mapper,
    error: str,
):
    """Listado descendente por cursor sobre `(creado_en, id)` (§6).

    Compartido por los listados de propinas y pagos para no repetir la misma
    query en cada repositorio.
    """
    try:
        query = (
            cliente.table(tabla)
            .select("*")
            .eq(columna, str(valor))
            .order("creado_en", desc=True)
            .order("id", desc=True)
            .limit(limit)
        )
        if cursor is not None:
            query = query.lt("creado_en", cursor.ts.isoformat())
        resp = query.execute()
    except APIError as exc:
        raise RepoError(error) from exc
    registros = [mapper(fila) for fila in (resp.data or [])]
    siguiente: Cursor | None = None
    if len(registros) == limit and registros:
        ultimo = registros[-1]
        siguiente = Cursor(id=ultimo.id, ts=ultimo.creado_en)
    return registros, siguiente


class SupabasePagoRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def guardar_pago(self, pago: Pago) -> Pago:
        try:
            self._cliente.table("pago").upsert(pago_a_fila(pago)).execute()
        except APIError as exc:
            raise RepoError("No se pudo guardar el pago.") from exc
        return pago

    def buscar_por_lote(self, lote_id: uuid.UUID) -> Pago | None:
        try:
            resp = (
                self._cliente.table("pago")
                .select("*")
                .eq("lote_id", str(lote_id))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el pago.") from exc
        return fila_a_pago(_dato_unico(resp)) if _dato_unico(resp) else None

    def listar_por_cooperativa(
        self, cooperativa_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Pago], Cursor | None]:
        return _listar_paginado(
            self._cliente, "pago", "cooperativa_id", cooperativa_id, cursor, limit,
            fila_a_pago, "No se pudo listar los pagos.",
        )

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float:
        """97% de las ventas confirmadas de los lotes del productor (join lote→finca)."""
        try:
            resp = (
                self._cliente.table("pago")
                # El embed de PostgREST usa el nombre real de la tabla (`lotes`,
                # no `lote`): con el singular responde PGRST200.
                .select("monto_productor, lotes!inner(finca!inner(productor_id))")
                .eq("estado_pago", EstadoPago.CONFIRMADO.value)
                .eq("lotes.finca.productor_id", str(productor_id))
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo calcular el saldo de pagos.") from exc
        return round(sum(fila["monto_productor"] for fila in (resp.data or [])), 2)

    def buscar_por_idempotencia(self, clave: uuid.UUID) -> Pago | None:
        try:
            resp = (
                self._cliente.table("pago")
                .select("*")
                .eq("idempotency_key", str(clave))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el pago.") from exc
        return fila_a_pago(_dato_unico(resp)) if _dato_unico(resp) else None


def propina_a_fila(propina: Propina) -> dict[str, Any]:
    return {
        "id": str(propina.id),
        "lote_id": str(propina.lote_id),
        "comprador_id": str(propina.comprador_id),
        "productor_id": str(propina.productor_id),
        "monto": propina.monto,
        "moneda": propina.moneda,
        "estado_propina": propina.estado_propina.value,
        "clave_idempotencia": propina.clave_idempotencia,
        "tx_hash": propina.tx_hash,
        "creado_en": propina.creado_en.isoformat(),
        "actualizado_en": propina.actualizado_en.isoformat(),
    }


def fila_a_propina(fila: dict[str, Any]) -> Propina:
    return Propina(
        id=_uuid(fila["id"]),
        lote_id=_uuid(fila["lote_id"]),
        comprador_id=_uuid(fila["comprador_id"]),
        productor_id=_uuid(fila["productor_id"]),
        monto=float(fila["monto"]),
        moneda=fila["moneda"],
        estado_propina=EstadoPropina(fila["estado_propina"]),
        clave_idempotencia=_o_none(fila.get("clave_idempotencia")),
        tx_hash=_o_none(fila.get("tx_hash")),
        creado_en=_dt(fila["creado_en"]),
        actualizado_en=_dt(fila["actualizado_en"]),
    )


class SupabasePropinaRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def guardar_propina(self, propina: Propina) -> Propina:
        try:
            self._cliente.table("propina").upsert(propina_a_fila(propina)).execute()
        except APIError as exc:
            raise RepoError("No se pudo guardar la propina.") from exc
        return propina

    def buscar_por_lote(self, lote_id: uuid.UUID) -> list[Propina]:
        try:
            resp = (
                self._cliente.table("propina")
                .select("*")
                .eq("lote_id", str(lote_id))
                .order("creado_en", desc=True)
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar las propinas.") from exc
        return [fila_a_propina(fila) for fila in (resp.data or [])]

    def buscar_por_idempotencia(self, clave: str) -> Propina | None:
        try:
            resp = (
                self._cliente.table("propina")
                .select("*")
                .eq("clave_idempotencia", clave)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar la propina.") from exc
        return fila_a_propina(_dato_unico(resp)) if _dato_unico(resp) else None

    def buscar_por_productor(
        self, productor_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]:
        return _listar_paginado(
            self._cliente, "propina", "productor_id", productor_id, cursor, limit,
            fila_a_propina, "No se pudo listar las propinas.",
        )

    def buscar_por_comprador(
        self, comprador_id: uuid.UUID, cursor: Cursor | None, limit: int
    ) -> tuple[list[Propina], Cursor | None]:
        return _listar_paginado(
            self._cliente, "propina", "comprador_id", comprador_id, cursor, limit,
            fila_a_propina, "No se pudo listar las propinas.",
        )

    def total_confirmado_por_productor(self, productor_id: uuid.UUID) -> float:
        """Propinas confirmadas del productor (100% directas, ADR-10)."""
        try:
            resp = (
                self._cliente.table("propina")
                .select("monto")
                .eq("productor_id", str(productor_id))
                .eq("estado_propina", EstadoPropina.CONFIRMADA.value)
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo calcular el saldo de propinas.") from exc
        return round(sum(fila["monto"] for fila in (resp.data or [])), 2)


class SupabaseFincaRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def buscar_por_id(self, finca_id: uuid.UUID) -> Finca | None:
        try:
            resp = (
                self._cliente.table("finca")
                .select("*")
                .eq("id", str(finca_id))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar la finca.") from exc
        return fila_a_finca(_dato_unico(resp)) if _dato_unico(resp) else None

    def _listar_por(self, columna: str, valor: uuid.UUID) -> list[Finca]:
        try:
            resp = (
                self._cliente.table("finca")
                .select("*")
                .eq(columna, str(valor))
                .order("nombre")
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudieron consultar las fincas.") from exc
        return [fila_a_finca(fila) for fila in (resp.data or [])]

    def listar_por_productor(self, productor_id: uuid.UUID) -> list[Finca]:
        return self._listar_por("productor_id", productor_id)

    def listar_por_cooperativa(self, cooperativa_id: uuid.UUID) -> list[Finca]:
        return self._listar_por("cooperativa_id", cooperativa_id)

    def listar_todas(self) -> list[Finca]:
        try:
            resp = self._cliente.table("finca").select("*").order("nombre").execute()
        except APIError as exc:
            raise RepoError("No se pudieron consultar las fincas.") from exc
        return [fila_a_finca(fila) for fila in (resp.data or [])]


class SupabaseUsuarioRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def buscar_por_id(self, usuario_id: uuid.UUID) -> Usuario | None:
        try:
            resp = (
                self._cliente.table("usuarios")
                .select("*")
                .eq("id", str(usuario_id))
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el usuario.") from exc
        return fila_a_usuario(_dato_unico(resp)) if _dato_unico(resp) else None

    def buscar_por_email(self, email: str) -> Usuario | None:
        try:
            resp = (
                self._cliente.table("usuarios")
                .select("*")
                .eq("email", email)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el usuario.") from exc
        return fila_a_usuario(_dato_unico(resp)) if _dato_unico(resp) else None

    def listar_cooperativas(self) -> list[Cooperativa]:
        try:
            resp = self._cliente.table("cooperativa").select("*").execute()
        except APIError as exc:
            raise RepoError("No se pudo listar las cooperativas.") from exc
        return [fila_a_cooperativa(fila) for fila in (resp.data or [])]

    def listar_compradores(self) -> list[Usuario]:
        try:
            resp = self._cliente.table("usuarios").select("*").eq("rol", "comprador").execute()
        except APIError as exc:
            raise RepoError("No se pudo listar los compradores.") from exc
        return [fila_a_usuario(fila) for fila in (resp.data or [])]


# ---------------------------------------------------------------- Anclas (ADR-11)


def ancla_a_fila(ancla: AnclaBlockchain) -> dict[str, Any]:
    return {
        "id": str(ancla.id),
        "qr_certificado_id": str(ancla.qr_certificado_id),
        "lote_id": str(ancla.lote_id),
        "lote_id_bytes32": ancla.lote_id_bytes32,
        "hash_raiz": ancla.hash_raiz,
        "chain_id": ancla.chain_id,
        "contrato": ancla.contrato,
        "runtime_code_hash": ancla.runtime_code_hash,
        "estado": ancla.estado.value,
        "tx_hash": ancla.tx_hash,
        "bloque": ancla.bloque,
        "nonce": ancla.nonce,
        "intentos": ancla.intentos,
        "codigo_error": ancla.codigo_error,
        "error": ancla.error,
        "proximo_intento": ancla.proximo_intento.isoformat(),
    }


def fila_a_ancla(fila: dict[str, Any]) -> AnclaBlockchain:
    return AnclaBlockchain(
        id=_uuid(fila["id"]),
        qr_certificado_id=_uuid(fila["qr_certificado_id"]),
        lote_id=_uuid(fila["lote_id"]),
        lote_id_bytes32=fila["lote_id_bytes32"],
        hash_raiz=fila["hash_raiz"],
        chain_id=int(fila["chain_id"]),
        estado=EstadoAncla(fila["estado"]),
        contrato=fila.get("contrato"),
        runtime_code_hash=fila.get("runtime_code_hash"),
        tx_hash=fila.get("tx_hash"),
        bloque=fila.get("bloque"),
        nonce=fila.get("nonce"),
        intentos=int(fila.get("intentos", 0)),
        codigo_error=fila.get("codigo_error"),
        error=fila.get("error"),
        enviada_en=_dt(fila["enviada_en"]) if fila.get("enviada_en") else None,
        confirmada_en=_dt(fila["confirmada_en"]) if fila.get("confirmada_en") else None,
        ultimo_chequeo_en=(
            _dt(fila["ultimo_chequeo_en"]) if fila.get("ultimo_chequeo_en") else None
        ),
        lock_token=_uuid(fila["lock_token"]) if fila.get("lock_token") else None,
        lock_hasta=_dt(fila["lock_hasta"]) if fila.get("lock_hasta") else None,
        proximo_intento=_dt(fila["proximo_intento"]),
        creado_en=_dt(fila["creado_en"]),
        actualizado_en=_dt(fila["actualizado_en"]),
    )


class SupabaseAnclaRepo:
    """Anclaje con lease global y fencing (tabla privada, migración 012)."""

    def __init__(self, cliente) -> None:
        self._cliente = cliente

    def encolar(self, ancla: AnclaBlockchain) -> AnclaBlockchain:
        try:
            self._cliente.table("blockchain_anclas").insert(ancla_a_fila(ancla)).execute()
        except APIError as exc:
            # El trigger pudo crear la fila en el mismo INSERT del certificado:
            # la unicidad por certificado es la que manda.
            if getattr(exc, "code", None) == "23505":
                existente = self.buscar_por_certificado(ancla.qr_certificado_id)
                if existente is not None:
                    return existente
            raise RepoError("No se pudo encolar el anclaje.") from exc
        return ancla

    def buscar_por_certificado(self, qr_id: uuid.UUID) -> AnclaBlockchain | None:
        return self._buscar("qr_certificado_id", str(qr_id))

    def buscar_por_lote(self, lote_id: uuid.UUID) -> AnclaBlockchain | None:
        return self._buscar("lote_id", str(lote_id))

    def _buscar(self, columna: str, valor: str) -> AnclaBlockchain | None:
        try:
            resp = (
                self._cliente.table("blockchain_anclas")
                .select("*")
                .eq(columna, valor)
                .maybe_single()
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el anclaje.") from exc
        fila = _dato_unico(resp)
        return fila_a_ancla(fila) if fila else None

    # ------------------------------------------------------------ lock global

    def adquirir_lock(self, nombre: str, lease_segundos: int) -> uuid.UUID | None:
        resp = self._rpc(
            "bean_adquirir_lock_anclaje",
            {"p_nombre": nombre, "p_lease_segundos": lease_segundos},
        )
        return _uuid(resp) if resp else None

    def renovar_lock(self, nombre: str, token: uuid.UUID, lease_segundos: int) -> bool:
        return bool(
            self._rpc(
                "bean_renovar_lock_anclaje",
                {
                    "p_nombre": nombre,
                    "p_lock_token": str(token),
                    "p_lease_segundos": lease_segundos,
                },
            )
        )

    def liberar_lock(self, nombre: str, token: uuid.UUID) -> bool:
        return bool(
            self._rpc(
                "bean_liberar_lock_anclaje",
                {"p_nombre": nombre, "p_lock_token": str(token)},
            )
        )

    def reclamar_siguiente(
        self, nombre: str, lock_token: uuid.UUID, lease_segundos: int
    ) -> AnclaBlockchain | None:
        resp = self._rpc(
            "bean_reclamar_ancla",
            {
                "p_lock_nombre": nombre,
                "p_lock_token": str(lock_token),
                "p_lease_segundos": lease_segundos,
            },
        )
        filas = resp or []
        return fila_a_ancla(filas[0]) if filas else None

    # ------------------------------------------------------------- transiciones

    def marcar_enviando(
        self, ancla_id: uuid.UUID, lock_token: uuid.UUID, nonce: int, tx_hash: str
    ) -> None:
        self._actualizar(
            ancla_id,
            {
                "estado": EstadoAncla.ENVIANDO.value,
                "nonce": nonce,
                "tx_hash": tx_hash,
            },
            lock_token,
        )

    def marcar_enviada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        tx_hash: str,
        enviada_en: datetime,
    ) -> None:
        self._actualizar(
            ancla_id,
            {
                "estado": EstadoAncla.ENVIADA.value,
                "tx_hash": tx_hash,
                "enviada_en": enviada_en.isoformat(),
                "ultimo_chequeo_en": enviada_en.isoformat(),
            },
            lock_token,
        )

    def marcar_confirmada(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        bloque: int,
        tx_hash: str,
        confirmada_en: datetime,
    ) -> None:
        self._actualizar(
            ancla_id,
            {
                "estado": EstadoAncla.CONFIRMADA.value,
                "bloque": bloque,
                "tx_hash": tx_hash,
                "confirmada_en": confirmada_en.isoformat(),
                "ultimo_chequeo_en": confirmada_en.isoformat(),
                "codigo_error": None,
                "error": None,
                "lock_token": None,
                "lock_hasta": None,
            },
            lock_token,
        )

    def marcar_fallida(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        codigo: str,
        error: str,
        proximo_intento: datetime,
    ) -> None:
        self._actualizar(
            ancla_id,
            {
                "estado": EstadoAncla.FALLIDA.value,
                "codigo_error": codigo,
                "error": error,
                "proximo_intento": proximo_intento.isoformat(),
                "lock_token": None,
                "lock_hasta": None,
            },
            lock_token,
        )

    def reprogramar(
        self,
        ancla_id: uuid.UUID,
        lock_token: uuid.UUID,
        proximo_intento: datetime,
        codigo: str,
        error: str,
        contar_intento: bool = True,
    ) -> None:
        actual = self._buscar("id", str(ancla_id))
        cambios: dict[str, Any] = {
            "intentos": (actual.intentos if actual else 0) + (1 if contar_intento else 0),
            "proximo_intento": proximo_intento.isoformat(),
            "codigo_error": codigo,
            "error": error,
            "ultimo_chequeo_en": datetime.now(UTC).isoformat(),
        }
        self._actualizar(ancla_id, cambios, lock_token)

    def marcar_reintento_manual(self, ancla_id: uuid.UUID, proximo_intento: datetime) -> None:
        self._actualizar(
            ancla_id,
            {
                "estado": EstadoAncla.PENDIENTE.value,
                "tx_hash": None,
                "nonce": None,
                "bloque": None,
                "enviada_en": None,
                "confirmada_en": None,
                "codigo_error": None,
                "error": None,
                "proximo_intento": proximo_intento.isoformat(),
                "lock_token": None,
                "lock_hasta": None,
            },
        )

    # ------------------------------------------------------------------ helpers

    def _rpc(self, nombre: str, parametros: dict[str, Any]) -> Any:
        try:
            return self._cliente.rpc(nombre, parametros).execute().data
        except APIError as exc:
            raise RepoError("No se pudo operar sobre el lock de anclaje.") from exc

    def _actualizar(
        self,
        ancla_id: uuid.UUID,
        cambios: dict[str, Any],
        lock_token: uuid.UUID | None = None,
    ) -> None:
        try:
            consulta = self._cliente.table("blockchain_anclas").update(cambios).eq(
                "id", str(ancla_id)
            )
            if lock_token is not None:
                # Fencing: un worker con lease vencido no sobrescribe al dueño.
                consulta = consulta.eq("lock_token", str(lock_token))
            respuesta = consulta.execute()
        except APIError as exc:
            raise RepoError("No se pudo actualizar el anclaje.") from exc
        if lock_token is not None and not (respuesta.data or []):
            # Cero filas con ese token: el lease se perdió; nunca se oculta.
            raise FencingPerdido("El lease venció: la fila ya no es de este worker.")
