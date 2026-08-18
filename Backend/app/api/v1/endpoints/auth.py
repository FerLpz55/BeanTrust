"""Endpoints de autenticación (§10)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import AuthProviderDep, limitar_login
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", dependencies=[Depends(limitar_login)])
def login(body: LoginRequest, provider: AuthProviderDep) -> TokenResponse:
    return provider.login(body.email, body.password)


@router.post("/refresh", dependencies=[Depends(limitar_login)])
def refresh(body: RefreshRequest, provider: AuthProviderDep) -> TokenResponse:
    return provider.refresh(body.refresh_token)
