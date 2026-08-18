"""Repositorios contra Supabase (PostgREST) usando el cliente oficial `supabase`.

Estas implementaciones se activan con `BEAN_REPO_BACKEND=supabase`. La
conexión real se valida en B11; aquí el código queda listo y testeable con un
cliente simulado. `lote_eventos` es append-only: solo `insert` y `select`
(§6), y además la BD lo garantiza con grants + trigger (migraciones B2).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from postgrest import APIError

from app.models.dominio import (
    CertificadoQR,
    Cooperativa,
    Estado,
    EstadoPago,
    Finca,
    Lote,
    LoteEvento,
    Pago,
    RepoError,
    Rol,
    TipoEvento,
    Usuario,
)
from app.utils.cursor import Cursor


def _uuid(valor: Any) -> uuid.UUID:
    return uuid.UUID(str(valor))


def _dt(valor: Any) -> datetime:
    return datetime.fromisoformat(str(valor))


def _dia(valor: Any) -> date:
    return date.fromisoformat(str(valor))


def _o_none(valor: Any) -> Any:
    return None if valor is None else valor


# ---------------------------------------------------------------- Lote


def lote_a_fila(lote: Lote) -> dict[str, Any]:
    return {
        "id": str(lote.id),
        "finca_id": str(lote.finca_id),
        "codigo_publico": lote.codigo_publico,
        "estado": lote.estado.value,
        "peso_actual_kg": lote.peso_actual_kg,
        "fecha_cosecha": lote.fecha_cosecha.isoformat(),
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


class SupabaseLoteRepo:
    def __init__(self, cliente) -> None:
        self._cliente = cliente

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
        if not resp.data:
            return None
        lote = fila_a_lote(resp.data)
        # Cargar el historial: lo necesita la idempotencia por Idempotency-Key
        # (si un retry llega, buscar_por_id debe ver los eventos ya insertados).
        lote.historial = self.listar_eventos(lote.id)
        return lote

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
        return fila_a_lote(resp.data) if resp.data else None

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
        try:
            resp = (
                self._cliente.table("lote_eventos")
                .select("*")
                .eq("lote_id", str(lote_id))
                .order("registrado_en", desc=True)
                .execute()
            )
        except APIError as exc:
            raise RepoError("No se pudo consultar el historial.") from exc
        return [fila_a_evento(fila) for fila in (resp.data or [])]


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
        return fila_a_qr(resp.data) if resp.data else None

    def registrar_verificacion(self, lote_id: uuid.UUID, dispositivo: str | None) -> None:
        try:
            self._cliente.table("verificacion").insert(
                {"lote_id": str(lote_id), "dispositivo": dispositivo}
            ).execute()
        except APIError as exc:
            raise RepoError("No se pudo registrar la verificación.") from exc


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
        return fila_a_pago(resp.data) if resp.data else None

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
        return fila_a_pago(resp.data) if resp.data else None


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
        return fila_a_finca(resp.data) if resp.data else None


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
        return fila_a_usuario(resp.data) if resp.data else None

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
        return fila_a_usuario(resp.data) if resp.data else None

    def listar_cooperativas(self) -> list[Cooperativa]:
        try:
            resp = self._cliente.table("cooperativa").select("*").execute()
        except APIError as exc:
            raise RepoError("No se pudo listar las cooperativas.") from exc
        return [fila_a_cooperativa(fila) for fila in (resp.data or [])]
