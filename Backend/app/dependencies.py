"""Inyección de dependencias compartidas (DI, §12).

Todo se resuelve con `Annotated` + `Depends`. El backend de datos y de auth se
elige por configuración (`BEAN_REPO_BACKEND`, `BEAN_AUTH_BACKEND`), de modo que
el mismo código corre con memoria/local (dev y CI) y con Supabase (prod).

Frontera de seguridad (B11): los endpoints **autenticados** construyen sus
repositorios con un cliente Supabase que lleva el JWT del usuario, de modo que
la RLS se evalúa de verdad. Solo las tareas de sistema (login/refresh, perfil
del token y verificación pública) usan la `service_role`.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.seguridad import (
    AuthProvider,
    Claims,
    LocalAuthProvider,
    PasswordService,
    SupabaseAuthProvider,
)
from app.models.dominio import CredencialesInvalidas, Finca, Rol, Usuario
from app.repositories.evidencia import (
    AlmacenEvidencia,
    InMemoryAlmacenEvidencia,
    RepositorioEvidencia,
    SupabaseAlmacenEvidencia,
)
from app.repositories.in_memory import (
    FakeGatewayPagos,
    InMemoryEvidenciaRepo,
    InMemoryFincaRepo,
    InMemoryLoteRepo,
    InMemoryPagoRepo,
    InMemoryPropinaRepo,
    InMemoryQRRepo,
    InMemorySesionRefreshRepo,
    InMemoryUsuarioRepo,
    Memoria,
)
from app.repositories.interfaces import (
    GatewayPagos,
    RepositorioFinca,
    RepositorioLote,
    RepositorioPago,
    RepositorioPropina,
    RepositorioQR,
    RepositorioUsuario,
)
from app.repositories.rate_limit import (
    InMemoryRateLimitRepo,
    RepositorioRateLimit,
    SupabaseRateLimitRepo,
)
from app.repositories.supabase import (
    SupabaseEvidenciaRepo,
    SupabaseFincaRepo,
    SupabaseLoteRepo,
    SupabasePagoRepo,
    SupabasePropinaRepo,
    SupabaseQRRepo,
    SupabaseUsuarioRepo,
)
from app.schemas.auth import CurrentUser
from app.services.evidencia_service import EvidenciaService
from app.services.finca_service import FincaService
from app.services.lote_service import LoteService
from app.services.mercado_service import MercadoService
from app.services.pagos_service import PagoService
from app.services.propina_service import PropinaService
from app.services.qr_service import QrService

_bearer = HTTPBearer(auto_error=False)

# --------------------------------------------------------------------- settings

SettingsDep = Annotated[Settings, Depends(get_settings)]


# ------------------------------------------------------------------ almacén en memoria

_memoria_global: Memoria | None = None


def _construir_memoria() -> Memoria:
    memoria = Memoria()
    hasher = PasswordService()
    id_admin = uuid.uuid4()
    id_coop = uuid.uuid4()
    id_prod = uuid.uuid4()
    id_comp = uuid.uuid4()
    usuarios = [
        Usuario(
            id_admin,
            "admin@beantrust.dev",
            Rol.ADMIN,
            "Administrador",
            hasher.hash("Admin123!"),
        ),
        Usuario(
            id_coop,
            "cooperativa@beantrust.dev",
            Rol.COOPERATIVA,
            "Café Veracruz",
            hasher.hash("Coop123!"),
        ),
        Usuario(
            id_prod,
            "productor@beantrust.dev",
            Rol.PRODUCTOR,
            "Juan Pérez",
            hasher.hash("Prod123!"),
        ),
        Usuario(
            id_comp,
            "comprador@beantrust.dev",
            Rol.COMPRADOR,
            "Comercializadora de Altura",
            hasher.hash("Comp123!"),
        ),
        Usuario(
            uuid.uuid4(),
            "fernando@test.com",
            Rol.PRODUCTOR,
            "Fernando Test",
            hasher.hash("fernando"),
        ),
    ]
    for usuario in usuarios:
        memoria.usuarios[usuario.id] = usuario
    memoria.fincas[uuid.UUID("11111111-1111-1111-1111-111111111111")] = Finca(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        productor_id=id_prod,
        cooperativa_id=id_coop,
        nombre="Finca La Esperanza",
        municipio="Coatepec",
        organica=True,
        altitud_min=1100.0,
        altitud_max=1400.0,
    )
    memoria.fincas[uuid.UUID("22222222-2222-2222-2222-222222222222")] = Finca(
        id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        productor_id=id_prod,
        cooperativa_id=id_coop,
        nombre="Finca El Encanto",
        municipio="Xico",
        organica=True,
        altitud_min=1200.0,
        altitud_max=1500.0,
    )
    return memoria


def _memoria() -> Memoria:
    global _memoria_global
    if _memoria_global is None:
        _memoria_global = _construir_memoria()
    return _memoria_global


_sesiones_refresh_global: InMemorySesionRefreshRepo | None = None


def _sesiones_refresh() -> InMemorySesionRefreshRepo:
    """Store compartido de refresh tokens (solo proveedor local)."""
    global _sesiones_refresh_global
    if _sesiones_refresh_global is None:
        _sesiones_refresh_global = InMemorySesionRefreshRepo()
    return _sesiones_refresh_global


_rate_limit_global: InMemoryRateLimitRepo | None = None


def _rate_limit_memoria() -> InMemoryRateLimitRepo:
    global _rate_limit_global
    if _rate_limit_global is None:
        _rate_limit_global = InMemoryRateLimitRepo()
    return _rate_limit_global


_almacen_evidencia_global: InMemoryAlmacenEvidencia | None = None


def _almacen_evidencia_memoria() -> InMemoryAlmacenEvidencia:
    """Bucket compartido a nivel de módulo: subir y firmar ven el mismo objeto."""
    global _almacen_evidencia_global
    if _almacen_evidencia_global is None:
        _almacen_evidencia_global = InMemoryAlmacenEvidencia()
    return _almacen_evidencia_global


# ------------------------------------------------------------------ clientes Supabase

@lru_cache
def _crear_cliente_supabase(url: str, clave: str):
    from supabase import create_client

    return create_client(url, clave)


def get_supabase_service_client(settings: SettingsDep):
    """Cliente con `service_role` (bypassa RLS). Solo tareas de sistema."""
    return _crear_cliente_supabase(settings.supabase_url, settings.supabase_service_key)


def get_supabase_user_client(
    request: AuthenticatedRequestDep,
    settings: SettingsDep,
):
    """Cliente nuevo por request que adjunta el JWT del usuario (RLS activa).

    No se cachea ni se usa `auth.set_session`: solo se fija el `Authorization`
    de PostgREST para que la base aplique las políticas del usuario.
    """
    from supabase import create_client

    cliente = create_client(settings.supabase_url, settings.supabase_anon_key)
    cliente.postgrest.auth(request.access_token)
    return cliente


# ------------------------------------------------------------------ repositorios
# `get_repo_*` (sin sufijo) = cliente de servicio: auth interna y verificación
# pública. `get_repo_*_usuario` = cliente con JWT del usuario: todo endpoint
# autenticado. Así ningún endpoint de negocio usa la service key.


def get_repo_lote(settings: SettingsDep) -> RepositorioLote:
    if settings.repo_backend == "supabase":
        return SupabaseLoteRepo(get_supabase_service_client(settings))
    return InMemoryLoteRepo(_memoria())


def get_repo_qr(settings: SettingsDep) -> RepositorioQR:
    if settings.repo_backend == "supabase":
        return SupabaseQRRepo(get_supabase_service_client(settings))
    return InMemoryQRRepo(_memoria())


def get_repo_pago(settings: SettingsDep) -> RepositorioPago:
    if settings.repo_backend == "supabase":
        return SupabasePagoRepo(get_supabase_service_client(settings))
    return InMemoryPagoRepo(_memoria())


def get_repo_propina(settings: SettingsDep) -> RepositorioPropina:
    if settings.repo_backend == "supabase":
        return SupabasePropinaRepo(get_supabase_service_client(settings))
    return InMemoryPropinaRepo(_memoria())


def get_repo_finca(settings: SettingsDep) -> RepositorioFinca:
    if settings.repo_backend == "supabase":
        return SupabaseFincaRepo(get_supabase_service_client(settings))
    return InMemoryFincaRepo(_memoria())


def get_repo_usuario(settings: SettingsDep) -> RepositorioUsuario:
    if settings.repo_backend == "supabase":
        return SupabaseUsuarioRepo(get_supabase_service_client(settings))
    return InMemoryUsuarioRepo(_memoria())


def get_repo_evidencia(settings: SettingsDep) -> RepositorioEvidencia:
    """Metadata de evidencias: SIEMPRE `service_role` (la tabla no tiene grants)."""
    if settings.repo_backend == "supabase":
        return SupabaseEvidenciaRepo(get_supabase_service_client(settings))
    return InMemoryEvidenciaRepo(_memoria())


def get_almacen_evidencia(settings: SettingsDep) -> AlmacenEvidencia:
    """Bucket privado: el backend sube/firma/elimina; el móvil nunca lo toca."""
    if settings.repo_backend == "supabase":
        return SupabaseAlmacenEvidencia(
            get_supabase_service_client(settings), settings.evidence_bucket
        )
    return _almacen_evidencia_memoria()


def get_repo_lote_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioLote:
    if settings.repo_backend == "supabase":
        return SupabaseLoteRepo(get_supabase_user_client(request, settings))
    return InMemoryLoteRepo(_memoria())


def get_repo_qr_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioQR:
    if settings.repo_backend == "supabase":
        return SupabaseQRRepo(get_supabase_user_client(request, settings))
    return InMemoryQRRepo(_memoria())


def get_repo_pago_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioPago:
    if settings.repo_backend == "supabase":
        return SupabasePagoRepo(get_supabase_user_client(request, settings))
    return InMemoryPagoRepo(_memoria())


def get_repo_propina_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioPropina:
    if settings.repo_backend == "supabase":
        return SupabasePropinaRepo(get_supabase_user_client(request, settings))
    return InMemoryPropinaRepo(_memoria())


def get_repo_finca_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioFinca:
    if settings.repo_backend == "supabase":
        return SupabaseFincaRepo(get_supabase_user_client(request, settings))
    return InMemoryFincaRepo(_memoria())


def get_repo_usuario_usuario(
    request: AuthenticatedRequestDep, settings: SettingsDep
) -> RepositorioUsuario:
    if settings.repo_backend == "supabase":
        return SupabaseUsuarioRepo(get_supabase_user_client(request, settings))
    return InMemoryUsuarioRepo(_memoria())


def get_gateway_pagos() -> GatewayPagos:
    return FakeGatewayPagos()


RepoLoteDep = Annotated[RepositorioLote, Depends(get_repo_lote_usuario)]
RepoQRDep = Annotated[RepositorioQR, Depends(get_repo_qr_usuario)]
RepoPagoDep = Annotated[RepositorioPago, Depends(get_repo_pago_usuario)]
RepoPropinaDep = Annotated[RepositorioPropina, Depends(get_repo_propina_usuario)]
RepoFincaDep = Annotated[RepositorioFinca, Depends(get_repo_finca_usuario)]
RepoUsuarioDep = Annotated[RepositorioUsuario, Depends(get_repo_usuario)]
RepoUsuarioAutenticadoDep = Annotated[RepositorioUsuario, Depends(get_repo_usuario_usuario)]
# Evidencias: no hay variante "usuario" (la tabla solo la ve `service_role`).
RepoEvidenciaDep = Annotated[RepositorioEvidencia, Depends(get_repo_evidencia)]
AlmacenEvidenciaDep = Annotated[AlmacenEvidencia, Depends(get_almacen_evidencia)]

# Repos de servicio: auth interna y verificación pública (sin RLS).
RepoLoteServicioDep = Annotated[RepositorioLote, Depends(get_repo_lote)]
RepoQRServicioDep = Annotated[RepositorioQR, Depends(get_repo_qr)]
RepoFincaServicioDep = Annotated[RepositorioFinca, Depends(get_repo_finca)]
RepoUsuarioServicioDep = Annotated[RepositorioUsuario, Depends(get_repo_usuario)]


# ------------------------------------------------------------------ autenticación

@dataclass(frozen=True)
class AuthenticatedRequest:
    """Usuario + token crudo. Única dependencia que valida el JWT."""

    user: CurrentUser
    access_token: str


def get_auth_provider(settings: SettingsDep, repo_usuarios: RepoUsuarioDep) -> AuthProvider:
    if settings.auth_backend == "supabase":
        return SupabaseAuthProvider(url=settings.supabase_url, anon_key=settings.supabase_anon_key)
    return LocalAuthProvider(
        secret=settings.jwt_secret,
        access_ttl=settings.access_token_ttl,
        refresh_ttl=settings.refresh_token_ttl,
        issuer=settings.token_issuer,
        audience=settings.token_audience,
        repo_usuarios=repo_usuarios,
        password_service=PasswordService(),
        repo_sesiones=_sesiones_refresh(),
    )


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]


def get_authenticated_request(
    credenciales: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    provider: AuthProviderDep,
    repo_usuarios: RepoUsuarioDep,
) -> AuthenticatedRequest:
    if credenciales is None or credenciales.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="No autenticado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims: Claims = provider.verify(credenciales.credentials)
    except CredencialesInvalidas as exc:
        raise HTTPException(
            status_code=401,
            detail=exc.mensaje,
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    usuario = repo_usuarios.buscar_por_id(claims.sub)
    if usuario is None:
        raise HTTPException(
            status_code=401,
            detail="Usuario no encontrado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedRequest(
        user=CurrentUser(id=usuario.id, rol=usuario.rol, email=usuario.email),
        access_token=credenciales.credentials,
    )


AuthenticatedRequestDep = Annotated[AuthenticatedRequest, Depends(get_authenticated_request)]


def get_current_user(request: AuthenticatedRequestDep) -> CurrentUser:
    return request.user


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


# ------------------------------------------------------------------ rate limit

def get_repo_rate_limit(settings: SettingsDep) -> RepositorioRateLimit:
    if settings.repo_backend == "supabase":
        return SupabaseRateLimitRepo(get_supabase_service_client(settings))
    return _rate_limit_memoria()


RepoRateLimitDep = Annotated[RepositorioRateLimit, Depends(get_repo_rate_limit)]


def ip_del_cliente(request: Request) -> str:
    """IP real del cliente, también detrás del proxy del hosting.

    Sin esto, `request.client.host` es la IP **del proxy** y todos los usuarios
    caen en el mismo cubo: unos pocos logins simultáneos disparan un 429 a gente
    que no ha hecho nada. Se prefiere la cabecera que escribe la plataforma
    (`x-vercel-forwarded-for`), que el cliente no puede falsificar porque Vercel
    la reescribe; `x-forwarded-for` es el estándar y su primera entrada es el
    cliente original.
    """
    for cabecera in ("x-vercel-forwarded-for", "x-forwarded-for"):
        valor = request.headers.get(cabecera)
        if valor:
            primera = valor.split(",")[0].strip()
            if primera:
                return primera
    return request.client.host if request.client else "desconocido"


def clave_rate_limit(request: Request, settings: Settings) -> str:
    """HMAC-SHA256 de `ip|ruta`: el cubo es por endpoint, sin guardar la IP.

    Incluir la ruta evita que los intentos de recuperación bloqueen el login (y
    viceversa), que era el comportamiento con un único cubo por IP.
    """
    mensaje = f"{ip_del_cliente(request)}|{request.url.path}".encode()
    return hmac.new(
        settings.rate_limit_hmac_secret.encode(), mensaje, hashlib.sha256
    ).hexdigest()


def limitar_login(
    request: Request, settings: SettingsDep, repo: RepoRateLimitDep
) -> None:
    """Aplica el límite por IP+endpoint en endpoints sensibles (login, A07)."""
    if not repo.consumir(
        clave_rate_limit(request, settings),
        settings.login_rate_limit,
        settings.rate_limit_window_seconds,
    ):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intente más tarde.")


def require_rol(*roles: Rol):
    """Dependencia de autorización por rol (RBAC). Uso: `Depends(require_rol(Rol.ADMIN))`."""

    def dependencia(usuario: CurrentUserDep) -> CurrentUser:
        if usuario.rol not in roles:
            raise HTTPException(status_code=403, detail="No tiene permisos para esta operación.")
        return usuario

    return dependencia


def bloquear_escrituras_mantenimiento(settings: SettingsDep) -> None:
    """Corta los POST de escritura durante una ventana de mantenimiento.

    Se aplica como dependencia de router/endpoint. Devuelve 503 con
    `Retry-After` cuando `BEAN_MAINTENANCE_WRITES=true`; en cualquier otro caso
    no hace nada.
    """
    if settings.maintenance_writes:
        raise HTTPException(
            status_code=503,
            detail="maintenance_writes_disabled",
            headers={"Retry-After": "600"},
        )


IdempotenciaDep = Annotated[uuid.UUID, Header(alias="Idempotency-Key")]


# ------------------------------------------------------------------ servicios

def get_qr_service() -> QrService:
    return QrService()


def get_evidencia_service(
    repo_evidencia: RepoEvidenciaDep,
    almacen: AlmacenEvidenciaDep,
    repo_finca: RepoFincaDep,
    settings: SettingsDep,
) -> EvidenciaService:
    return EvidenciaService(
        repo_evidencia=repo_evidencia,
        almacen=almacen,
        repo_finca=repo_finca,
        bucket=settings.evidence_bucket,
        max_bytes=settings.evidence_max_bytes,
        ttl_hours=settings.evidence_ttl_hours,
    )


def get_lote_service(
    repo_lote: RepoLoteDep,
    repo_qr: RepoQRDep,
    repo_finca: RepoFincaDep,
    repo_usuario: RepoUsuarioAutenticadoDep,
    qr_service: Annotated[QrService, Depends(get_qr_service)],
    repo_evidencia: RepoEvidenciaDep,
) -> LoteService:
    return LoteService(
        repo_lote=repo_lote,
        repo_qr=repo_qr,
        repo_finca=repo_finca,
        repo_usuario=repo_usuario,
        qr_service=qr_service,
        repo_evidencia=repo_evidencia,
    )


def get_lote_service_publico(
    repo_lote: RepoLoteServicioDep,
    repo_qr: RepoQRServicioDep,
    repo_finca: RepoFincaServicioDep,
    repo_usuario: RepoUsuarioServicioDep,
    qr_service: Annotated[QrService, Depends(get_qr_service)],
) -> LoteService:
    """Verificación pública: service key, sin RLS (por diseño, §8)."""
    return LoteService(
        repo_lote=repo_lote,
        repo_qr=repo_qr,
        repo_finca=repo_finca,
        repo_usuario=repo_usuario,
        qr_service=qr_service,
    )


def get_pagos_service(
    repo_pago: RepoPagoDep,
    repo_lote: RepoLoteDep,
    repo_finca: RepoFincaDep,
    gateway: Annotated[GatewayPagos, Depends(get_gateway_pagos)],
) -> PagoService:
    return PagoService(
        repo_pago=repo_pago,
        repo_lote=repo_lote,
        repo_finca=repo_finca,
        gateway=gateway,
    )


def get_propina_service(
    repo_propina: RepoPropinaDep,
    repo_lote: RepoLoteDep,
    repo_finca: RepoFincaDep,
    repo_usuario: RepoUsuarioAutenticadoDep,
    repo_pago: RepoPagoDep,
    gateway: Annotated[GatewayPagos, Depends(get_gateway_pagos)],
) -> PropinaService:
    return PropinaService(
        repo_propina=repo_propina,
        repo_lote=repo_lote,
        repo_finca=repo_finca,
        repo_usuario=repo_usuario,
        repo_pago=repo_pago,
        gateway=gateway,
    )


def get_finca_service(repo_finca: RepoFincaDep) -> FincaService:
    return FincaService(repo_finca=repo_finca)


def get_mercado_service(
    repo_pago: RepoPagoDep,
    repo_propina: RepoPropinaDep,
    repo_usuario: RepoUsuarioAutenticadoDep,
    propina_service: Annotated[PropinaService, Depends(get_propina_service)],
) -> MercadoService:
    return MercadoService(
        repo_pago=repo_pago,
        repo_propina=repo_propina,
        repo_usuario=repo_usuario,
        propina_service=propina_service,
    )


LoteServiceDep = Annotated[LoteService, Depends(get_lote_service)]
PublicLoteServiceDep = Annotated[LoteService, Depends(get_lote_service_publico)]
EvidenciaServiceDep = Annotated[EvidenciaService, Depends(get_evidencia_service)]
MercadoServiceDep = Annotated[MercadoService, Depends(get_mercado_service)]
FincaServiceDep = Annotated[FincaService, Depends(get_finca_service)]
PagoServiceDep = Annotated[PagoService, Depends(get_pagos_service)]
PropinaServiceDep = Annotated[PropinaService, Depends(get_propina_service)]
