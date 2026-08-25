"""Endpoints de autenticación (§10)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import AuthProviderDep, CurrentUserDep, SettingsDep, limitar_login
from app.schemas.auth import (
    CurrentUser,
    LoginRequest,
    RecoverConfirmRequest,
    RecoverRequest,
    RecoverResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", dependencies=[Depends(limitar_login)])
def login(body: LoginRequest, provider: AuthProviderDep) -> TokenResponse:
    return provider.login(body.email, body.password)


@router.post("/register", dependencies=[Depends(limitar_login)])
def register(body: RegisterRequest, provider: AuthProviderDep) -> TokenResponse:
    return provider.register(body.email, body.password, body.nombre, body.rol)


@router.post("/refresh", dependencies=[Depends(limitar_login)])
def refresh(body: RefreshRequest, provider: AuthProviderDep) -> TokenResponse:
    return provider.refresh(body.refresh_token)


@router.post("/recover", dependencies=[Depends(limitar_login)])
def recover(
    body: RecoverRequest, provider: AuthProviderDep, settings: SettingsDep
) -> RecoverResponse:
    """Solicita recuperación de contraseña (B14).

    La respuesta es **uniforme** exista o no el email (no permite enumerar
    cuentas). En desarrollo se devuelve el token porque no hay envío de correo;
    con Supabase Auth (B11) el enlace se entrega por email.
    """
    token = provider.emitir_token_recuperacion(body.email)
    expone_token = settings.environment != "production" and token is not None
    return RecoverResponse(token_dev=token if expone_token else None)


@router.post("/recover/confirm", dependencies=[Depends(limitar_login)])
def recover_confirm(body: RecoverConfirmRequest, provider: AuthProviderDep) -> RecoverResponse:
    """Consume el token de recuperación (un solo uso) y fija la nueva contraseña."""
    provider.restablecer_password(body.token, body.password)
    return RecoverResponse(mensaje="Contraseña actualizada.")


@router.get("/me")
def perfil_usuario(usuario: CurrentUserDep) -> CurrentUser:
    """Perfil del usuario autenticado (incluye rol y finca si productor)."""
    return usuario
