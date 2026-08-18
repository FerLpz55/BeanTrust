"""Inyección de dependencias compartidas (DI, §12).

Todo se resuelve con `Annotated` + `Depends`. El backend de datos y de auth se
elige por configuración (`BEAN_REPO_BACKEND`, `BEAN_AUTH_BACKEND`), de modo que
el mismo código corre con memoria/local (dev y CI) y con Supabase (prod).
"""

from __future__ import annotations

import uuid
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.rate_limit import RateLimiter
from app.core.seguridad import (
    AuthProvider,
    Claims,
    LocalAuthProvider,
    PasswordService,
    SupabaseAuthProvider,
)
from app.models.dominio import CredencialesInvalidas, Finca, Rol, Usuario
from app.repositories.in_memory import (
    FakeGatewayPagos,
    InMemoryFincaRepo,
    InMemoryLoteRepo,
    InMemoryPagoRepo,
    InMemoryQRRepo,
    InMemoryUsuarioRepo,
    Memoria,
)
from app.repositories.interfaces import (
    GatewayPagos,
    RepositorioFinca,
    RepositorioLote,
    RepositorioPago,
    RepositorioQR,
    RepositorioUsuario,
)
from app.repositories.supabase import (
    SupabaseFincaRepo,
    SupabaseLoteRepo,
    SupabasePagoRepo,
    SupabaseQRRepo,
    SupabaseUsuarioRepo,
)
from app.schemas.auth import CurrentUser
from app.services.lote_service import LoteService
from app.services.pagos_service import PagoService
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


# ------------------------------------------------------------------ repositorios

# TODO(B11): la RLS queda inerte si el backend solo usa service key. Al conectar
# el proyecto real, cada repositorio debe adjuntar el JWT del usuario
# autenticado (cliente con `anon_key` + `.auth.set_session(jwt)`) en las
# operaciones por-tenant, y reservar la service key solo para la verificación
# pública (/verificar) y tareas de sistema. Auditoría OWASP A01/A04.



@lru_cache
def _cliente_supabase(settings: Settings):
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_key)

def get_repo_lote(settings: SettingsDep) -> RepositorioLote:
    if settings.repo_backend == "supabase":
        return SupabaseLoteRepo(_cliente_supabase(settings))
    return InMemoryLoteRepo(_memoria())


def get_repo_qr(settings: SettingsDep) -> RepositorioQR:
    if settings.repo_backend == "supabase":
        return SupabaseQRRepo(_cliente_supabase(settings))
    return InMemoryQRRepo(_memoria())


def get_repo_pago(settings: SettingsDep) -> RepositorioPago:
    if settings.repo_backend == "supabase":
        return SupabasePagoRepo(_cliente_supabase(settings))
    return InMemoryPagoRepo(_memoria())


def get_repo_finca(settings: SettingsDep) -> RepositorioFinca:
    if settings.repo_backend == "supabase":
        return SupabaseFincaRepo(_cliente_supabase(settings))
    return InMemoryFincaRepo(_memoria())


def get_repo_usuario(settings: SettingsDep) -> RepositorioUsuario:
    if settings.repo_backend == "supabase":
        return SupabaseUsuarioRepo(_cliente_supabase(settings))
    return InMemoryUsuarioRepo(_memoria())


def get_gateway_pagos() -> GatewayPagos:
    return FakeGatewayPagos()


RepoLoteDep = Annotated[RepositorioLote, Depends(get_repo_lote)]
RepoQRDep = Annotated[RepositorioQR, Depends(get_repo_qr)]
RepoPagoDep = Annotated[RepositorioPago, Depends(get_repo_pago)]
RepoFincaDep = Annotated[RepositorioFinca, Depends(get_repo_finca)]
RepoUsuarioDep = Annotated[RepositorioUsuario, Depends(get_repo_usuario)]


# ------------------------------------------------------------------ autenticación

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
    )


AuthProviderDep = Annotated[AuthProvider, Depends(get_auth_provider)]


def get_current_user(
    credenciales: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    provider: AuthProviderDep,
    repo_usuarios: RepoUsuarioDep,
) -> CurrentUser:
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
    return CurrentUser(id=usuario.id, rol=usuario.rol, email=usuario.email)


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


@lru_cache
def _limiter_login(limit: int) -> RateLimiter:
    return RateLimiter(max_requests=limit, window_seconds=60)


def limitar_login(request: Request) -> None:
    """Aplica el límite por IP en endpoints sensibles (login, A07)."""
    ip = request.client.host if request.client else "desconocido"
    if not _limiter_login(get_settings().login_rate_limit).permite(ip):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intente más tarde.")


def require_rol(*roles: Rol):
    """Dependencia de autorización por rol (RBAC). Uso: `Depends(require_rol(Rol.ADMIN))`."""

    def dependencia(usuario: CurrentUserDep) -> CurrentUser:
        if usuario.rol not in roles:
            raise HTTPException(status_code=403, detail="No tiene permisos para esta operación.")
        return usuario

    return dependencia


IdempotenciaDep = Annotated[uuid.UUID, Header(alias="Idempotency-Key")]


# ------------------------------------------------------------------ servicios

def get_qr_service() -> QrService:
    return QrService()


def get_lote_service(
    repo_lote: RepoLoteDep,
    repo_qr: RepoQRDep,
    repo_finca: RepoFincaDep,
    repo_usuario: RepoUsuarioDep,
    qr_service: Annotated[QrService, Depends(get_qr_service)],
) -> LoteService:
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


LoteServiceDep = Annotated[LoteService, Depends(get_lote_service)]
PagoServiceDep = Annotated[PagoService, Depends(get_pagos_service)]
