"""Servicio de aplicación de lotes (§6, capa 2).

Única capa que conoce las reglas de negocio y orquesta el dominio con los
repositorios. Los routers jamás tocan la BD ni la máquina de estados.
"""

from __future__ import annotations

import logging
import uuid

from app.models.dominio import (
    CertificadoInvalido,
    CertificadoNoEncontrado,
    EstadoEvidencia,
    EvidenciaNoEncontrada,
    EvidenciaYaAdjunta,
    Finca,
    Lote,
    LoteNoEncontrado,
    NoAutorizado,
    RepoError,
    Rol,
    TipoEvento,
    TransicionInvalida,
    ahora_utc,
)
from app.schemas.auth import CurrentUser
from app.schemas.lote import EventoCreate, LoteCreate
from app.services.autorizacion import autorizar_finca
from app.services.qr_service import QrService
from app.utils.cursor import Cursor

logger = logging.getLogger(__name__)


class LoteService:
    def __init__(
        self,
        repo_lote,
        repo_qr,
        repo_finca,
        repo_usuario,
        qr_service: QrService,
        repo_evidencia=None,
        trazabilidad=None,
    ) -> None:
        self._repo_lote = repo_lote
        self._repo_qr = repo_qr
        self._repo_finca = repo_finca
        self._repo_usuario = repo_usuario
        self._qr_service = qr_service
        # Opcional para no romper la verificación pública (nunca adjunta
        # evidencia); el alta sí lo inyecta desde dependencies.
        self._repo_evidencia = repo_evidencia
        # Opcional: encola el anclaje on-chain al emitir el Pasaporte (ADR-11).
        self._trazabilidad = trazabilidad

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
        autorizar_finca(self._repo_finca, usuario, finca_id)

    # ------------------------------------------------------------------ operaciones

    def registrar_cosecha(self, datos: LoteCreate, usuario: CurrentUser) -> Lote:
        # Con evidencia, el alta es atómica (RPC migración 008): el repositorio
        # persiste lote + evento génesis + evidencia ADJUNTA en una transacción.
        # No aplica el atajo de "lote existente": un replay lo resuelve el RPC.
        if datos.evidencia_id is not None:
            return self._registrar_cosecha_con_evidencia(datos, usuario)

        lote_id = datos.id or uuid.uuid4()
        if datos.id is not None:
            existente = self._repo_lote.buscar_por_id(datos.id)
            if existente is not None:
                # Reintento del sync offline: el lote ya existe. Si la evidencia
                # quedó PENDIENTE (el primer intento no llegó a marcarla), se
                # cierra aquí para no dejar huérfano el objeto en Storage.
                self._autorizar_lote(usuario, existente)
                self._marcar_evidencia_pendiente(datos.evidencia_id, existente.id, usuario)
                return existente
        self._autorizar_finca(usuario, datos.finca_id)
        evidencia_url, evidencia_sha256 = self._resolver_evidencia(
            datos.evidencia_id, lote_id, datos.finca_id, usuario
        )
        lote = Lote(
            id=lote_id,
            finca_id=datos.finca_id,
            codigo_publico=self._qr_service.generar_codigo_publico(),
            fecha_cosecha=datos.fecha_cosecha,
            variedad=datos.variedad,
            metodo_beneficiado=datos.metodo_beneficiado,
            evidencia_url=evidencia_url,
            evidencia_sha256=evidencia_sha256,
        )
        evento = lote.registrar_cosecha(
            usuario.id,
            datos.peso_kg,
            variedad=datos.variedad,
            metodo_beneficiado=datos.metodo_beneficiado,
            evidencia_url=evidencia_url,
            evidencia_sha256=evidencia_sha256,
        )
        self._repo_lote.guardar(lote)
        self._repo_lote.adjuntar_evento(evento)
        self._marcar_evidencia_pendiente(datos.evidencia_id, lote.id, usuario)
        return lote

    def _registrar_cosecha_con_evidencia(
        self, datos: LoteCreate, usuario: CurrentUser
    ) -> Lote:
        """Alta atómica con evidencia: el repo/RPC resuelve url y sha de la fila.

        El dominio calcula el hash génesis; el repositorio jamás acepta la
        evidencia del cliente sin validar tenencia y estado (ADR-14).
        """
        self._autorizar_finca(usuario, datos.finca_id)
        lote = Lote(
            id=datos.id or uuid.uuid4(),
            finca_id=datos.finca_id,
            codigo_publico=self._qr_service.generar_codigo_publico(),
            fecha_cosecha=datos.fecha_cosecha,
            variedad=datos.variedad,
            metodo_beneficiado=datos.metodo_beneficiado,
        )
        evento = lote.registrar_cosecha(
            usuario.id,
            datos.peso_kg,
            variedad=datos.variedad,
            metodo_beneficiado=datos.metodo_beneficiado,
        )
        return self._repo_lote.registrar_cosecha_con_evidencia(
            lote, evento, datos.evidencia_id, ahora_utc()
        )

    def _resolver_evidencia(
        self,
        evidencia_id: uuid.UUID | None,
        lote_id: uuid.UUID,
        finca_id: uuid.UUID,
        usuario: CurrentUser,
    ) -> tuple[str | None, str | None]:
        """Valida la evidencia referenciada y devuelve (url, sha) de la FILA.

        Nunca se aceptan url/sha del cuerpo: se leen de la evidencia ya subida
        por el backend, de modo que el móvil no puede inyectar una URL ajena.
        """
        if evidencia_id is None:
            return None, None
        evidencia = self._evidencia_o_error(evidencia_id)
        if evidencia.estado is not EstadoEvidencia.PENDIENTE:
            raise EvidenciaYaAdjunta("La evidencia ya está adjunta a un lote.")
        if (
            evidencia.uploader_id != usuario.id
            or evidencia.finca_id != finca_id
            or evidencia.lote_id != lote_id
        ):
            raise NoAutorizado("La evidencia no corresponde a este lote.")
        return evidencia.storage_key, evidencia.sha256

    def _marcar_evidencia_pendiente(
        self, evidencia_id: uuid.UUID | None, lote_id: uuid.UUID, usuario: CurrentUser
    ) -> None:
        if evidencia_id is None:
            return
        evidencia = self._evidencia_o_error(evidencia_id)
        if evidencia.uploader_id != usuario.id or evidencia.lote_id != lote_id:
            raise NoAutorizado("La evidencia no corresponde a este lote.")
        if evidencia.estado is EstadoEvidencia.PENDIENTE:
            self._repo_evidencia.marcar_adjunta(evidencia.id, ahora_utc())

    def _evidencia_o_error(self, evidencia_id: uuid.UUID):
        if self._repo_evidencia is None:
            raise RepoError("El repositorio de evidencias no está configurado.")
        evidencia = self._repo_evidencia.buscar_por_id(evidencia_id)
        if evidencia is None:
            raise EvidenciaNoEncontrada("La evidencia no existe.")
        return evidencia

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
            metodo_beneficiado=evento.metodo_beneficiado,
            metodo_fermentacion=evento.metodo_fermentacion,
            fermentacion_horas=evento.fermentacion_horas,
            humedad_inicial_pct=evento.humedad_inicial_pct,
            humedad_final_pct=evento.humedad_final_pct,
            metodo_secado=evento.metodo_secado,
            dias_reposo=evento.dias_reposo,
            puntaje_sca=evento.puntaje_sca,
            defectos=evento.defectos,
            densidad=evento.densidad,
            tamiz=evento.tamiz,
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
        # El anclaje on-chain es una cola aparte: una falla al encolar NUNCA
        # impide emitir el certificado ni verificar el QR (ADR-11).
        if self._trazabilidad is not None:
            try:
                self._trazabilidad.encolar_certificado(qr, lote)
            except Exception:
                logger.exception("No se pudo encolar el anclaje del certificado %s", qr.codigo)

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
        # Se resuelven las fincas del usuario UNA vez y se filtra por
        # pertenencia: comprobarlas lote a lote disparaba una consulta por lote
        # (N+1 contra PostgREST, invisible con el almacén en memoria).
        #
        # Nota de alcance: la página se pide a la BD y se filtra después, así
        # que con varios productores en la misma base una página puede llegar
        # corta o vacía aunque el usuario tenga más lotes más atrás. Hoy no se
        # nota (una sola finca por productor); la solución de fondo es filtrar
        # en la consulta, no aquí.
        if usuario.rol is Rol.ADMIN:
            return lotes, siguiente
        fincas_propias = {finca.id for finca in self._fincas_de(usuario)}
        permitidos = [lote for lote in lotes if lote.finca_id in fincas_propias]
        return permitidos, siguiente

    def _fincas_de(self, usuario: CurrentUser) -> list[Finca]:
        if usuario.rol is Rol.PRODUCTOR:
            return self._repo_finca.listar_por_productor(usuario.id)
        if usuario.rol is Rol.COOPERATIVA:
            return self._repo_finca.listar_por_cooperativa(usuario.id)
        return []

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
        """Verificación pública del Pasaporte de Café (§8): 200 / 404 / 409.

        La integridad se corta por `emitido_en` (eventos posteriores a la
        emisión NO forman parte del hash canónico). Verificación con
        hash por etapa (ADR-11).
        """
        qr = self._repo_qr.buscar_por_codigo(codigo)
        if qr is None:
            raise CertificadoNoEncontrado("Código de verificación no encontrado.")
        lote = self._repo_lote.buscar_por_id(qr.lote_id)
        if lote is None:
            raise CertificadoInvalido("El certificado no corresponde a ningún lote.")
        lote.historial = self._repo_lote.listar_eventos(lote.id)
        # Verificación con corte por emitido_en (ADR-11, ADR-13)
        hash_actual = self._qr_service.hash_lote(lote, hasta_emitido_en=True)
        if hash_actual != qr.hash_sha256:
            raise CertificadoInvalido("El certificado no coincide con el historial del lote.")
        finca = self._repo_finca.buscar_por_id(lote.finca_id)
        productor = self._repo_usuario.buscar_por_id(finca.productor_id) if finca else None
        self._repo_qr.registrar_verificacion(lote.id, dispositivo)
        return lote, qr, finca, productor
