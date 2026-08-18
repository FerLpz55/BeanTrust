"""Servicio de aplicación de lotes (§6, capa 2).

Única capa que conoce las reglas de negocio y orquesta el dominio con los
repositorios. Los routers jamás tocan la BD ni la máquina de estados.
"""

from __future__ import annotations

import uuid

from app.models.dominio import (
    CertificadoInvalido,
    CertificadoNoEncontrado,
    Lote,
    LoteNoEncontrado,
    NoAutorizado,
    Rol,
    TipoEvento,
    TransicionInvalida,
)
from app.schemas.auth import CurrentUser
from app.schemas.lote import EventoCreate, LoteCreate
from app.services.qr_service import QrService
from app.utils.cursor import Cursor


class LoteService:
    def __init__(self, repo_lote, repo_qr, repo_finca, repo_usuario, qr_service: QrService) -> None:
        self._repo_lote = repo_lote
        self._repo_qr = repo_qr
        self._repo_finca = repo_finca
        self._repo_usuario = repo_usuario
        self._qr_service = qr_service

    # ------------------------------------------------------------------ autorización

    def _autorizar_lote(self, usuario: CurrentUser, lote: Lote) -> Lote:
        if usuario.rol is Rol.ADMIN:
            return lote
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        if finca is None:
            raise NoAutorizado("No tiene acceso a este lote.")
        if usuario.rol is Rol.PRODUCTOR and finca.productor_id == usuario.id:
            return lote
        if usuario.rol is Rol.COOPERATIVA and finca.cooperativa_id == usuario.id:
            return lote
        raise NoAutorizado("No tiene acceso a este lote.")

    def _autorizar_finca(self, usuario: CurrentUser, finca_id: uuid.UUID) -> None:
        if usuario.rol is Rol.ADMIN:
            return
        finca = self._repo_finca.buscar_por_id(finca_id)
        if finca is None:
            raise NoAutorizado("La finca no existe o no tiene acceso a ella.")
        if usuario.rol is Rol.PRODUCTOR and finca.productor_id == usuario.id:
            return
        if usuario.rol is Rol.COOPERATIVA and finca.cooperativa_id == usuario.id:
            return
        raise NoAutorizado("La finca no existe o no tiene acceso a ella.")

    # ------------------------------------------------------------------ operaciones

    def registrar_cosecha(self, datos: LoteCreate, usuario: CurrentUser) -> Lote:
        if datos.id is not None:
            existente = self._repo_lote.buscar_por_id(datos.id)
            if existente is not None:
                self._autorizar_lote(usuario, existente)
                return existente
        self._autorizar_finca(usuario, datos.finca_id)
        lote = Lote(
            id=datos.id or uuid.uuid4(),
            finca_id=datos.finca_id,
            codigo_publico=self._qr_service.generar_codigo_publico(),
            fecha_cosecha=datos.fecha_cosecha,
        )
        evento = lote.registrar_cosecha(usuario.id, datos.peso_kg)
        self._repo_lote.guardar(lote)
        self._repo_lote.adjuntar_evento(evento)
        return lote

    def avanzar_estado(
        self,
        usuario: CurrentUser,
        lote_id: uuid.UUID,
        evento: EventoCreate,
        idempotencia: uuid.UUID,
    ) -> Lote:
        if evento.tipo is TipoEvento.VENTA:
            raise TransicionInvalida(
                "La venta se registra por POST /v1/pagos (dispara el pago on-chain)."
            )
        lote = self._repo_lote.buscar_por_id(lote_id)
        if lote is None:
            raise LoteNoEncontrado("Lote no encontrado.")
        self._autorizar_lote(usuario, lote)
        if any(e.id == idempotencia for e in lote.historial):
            return lote
        nuevo_evento = lote.avanzar(
            tipo=evento.tipo,
            actor_id=usuario.id,
            evento_id=idempotencia,
            peso_kg=evento.peso_kg,
            merma_pct=evento.merma_pct,
            comprador_id=evento.comprador_id,
        )
        self._repo_lote.adjuntar_evento(nuevo_evento)
        self._emitir_certificado_si_corresponde(lote)
        self._repo_lote.guardar(lote)
        return lote

    def _emitir_certificado_si_corresponde(self, lote: Lote) -> None:
        if lote.certificado is not None:
            return
        if lote.estado.value not in ("TOSTADO", "VENDIDO"):
            return
        qr = self._qr_service.crear_certificado(lote)
        lote.generar_certificado(qr)
        self._repo_qr.guardar_certificado(qr)

    def obtener(self, usuario: CurrentUser, lote_id: uuid.UUID) -> Lote:
        lote = self._repo_lote.buscar_por_id(lote_id)
        if lote is None:
            raise LoteNoEncontrado("Lote no encontrado.")
        self._autorizar_lote(usuario, lote)
        lote.historial = self._repo_lote.listar_eventos(lote.id)
        return lote

    def listar(
        self, usuario: CurrentUser, cursor: Cursor | None, limit: int
    ) -> tuple[list[Lote], Cursor | None]:
        if usuario.rol is Rol.COMPRADOR:
            raise NoAutorizado("Los compradores solo verifican vía QR público.")
        lotes, siguiente = self._repo_lote.listar(cursor, limit)
        # En el MVP el filtrado fino por finca lo garantiza RLS (Supabase); en
        # memoria se filtran las fincas del usuario.
        permitidos = [
            lote
            for lote in lotes
            if self._puede_ver(usuario, lote)
        ]
        return permitidos, siguiente

    def _puede_ver(self, usuario: CurrentUser, lote: Lote) -> bool:
        if usuario.rol is Rol.ADMIN:
            return True
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        if finca is None:
            return False
        if usuario.rol is Rol.PRODUCTOR:
            return finca.productor_id == usuario.id
        if usuario.rol is Rol.COOPERATIVA:
            return finca.cooperativa_id == usuario.id
        return False

    def verificar(self, codigo: str, dispositivo: str | None = None):
        """Verificación pública del certificado (§8): 200 / 404 / 409."""
        qr = self._repo_qr.buscar_por_codigo(codigo)
        if qr is None:
            raise CertificadoNoEncontrado("Código de verificación no encontrado.")
        lote = self._repo_lote.buscar_por_id(qr.lote_id)
        if lote is None:
            raise CertificadoInvalido("El certificado no corresponde a ningún lote.")
        lote.historial = self._repo_lote.listar_eventos(lote.id)
        hash_actual = self._qr_service.hash_lote(lote)
        if hash_actual != qr.hash_sha256:
            raise CertificadoInvalido("El certificado no coincide con el historial del lote.")
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        productor = self._repo_usuario.buscar_por_id(finca.productor_id) if finca else None
        self._repo_qr.registrar_verificacion(lote.id, dispositivo)
        return lote, qr, finca, productor
