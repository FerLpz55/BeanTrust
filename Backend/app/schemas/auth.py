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


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nombre: str = Field(min_length=2, max_length=128)
    rol: Rol = Rol.PRODUCTOR


class TokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=4096)


class RecoverRequest(BaseModel):
    email: EmailStr


class RecoverConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    password: str = Field(min_length=8, max_length=128)


class RecoverResponse(BaseModel):
    """Respuesta uniforme: nunca revela si el email está registrado.

    `token_dev` solo se rellena con el proveedor local (desarrollo), donde no
    hay envío de correo; con Supabase Auth (B11) el enlace llega por email.
    """

    mensaje: str = "Si el correo está registrado, se enviaron instrucciones."
    token_dev: str | None = None


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


class FincaRead(BaseModel):
    """Finca visible para el usuario autenticado (§6)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    municipio: str
    organica: bool
    altitud_min: float | None = None
    altitud_max: float | None = None


class CurrentUser(BaseModel):
    """Usuario autenticado inyectado por `get_current_user`."""

    id: uuid.UUID
    rol: Rol
    email: EmailStr | None = None
