"""Schemas de autenticación y usuarios (§10)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.dominio import Rol
from app.schemas.comunes import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=4096)


class UsuarioRead(ORMModel):
    id: uuid.UUID
    email: EmailStr
    rol: Rol
    nombre: str


class CooperativaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    rfc: str | None = None
    contacto: str | None = None
    municipio: str | None = None


class CurrentUser(BaseModel):
    """Usuario autenticado inyectado por `get_current_user`."""

    id: uuid.UUID
    rol: Rol
    email: EmailStr | None = None
