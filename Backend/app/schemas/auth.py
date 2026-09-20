"""Schemas de autenticación y usuarios (§10)."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.dominio import Rol
from app.schemas.comunes import ORMModel


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    nombre: str = Field(min_length=2, max_length=128)
    # El alta pública solo crea productores. `rol` se acepta por compatibilidad,
    # pero un valor privilegiado se rechaza (422) y el proveedor fuerza
    # `productor` de todos modos (defensa en profundidad; el trigger de Auth
    # también lo impone para altas directas contra Supabase).
    rol: Rol | None = None

    @field_validator("rol")
    @classmethod
    def _solo_productor(cls, valor: Rol | None) -> Rol | None:
        if valor is not None and valor is not Rol.PRODUCTOR:
            raise ValueError("El alta pública solo permite el rol productor.")
        return valor


class TokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    # Sin mínimo largo: los refresh tokens de Supabase son cadenas opacas de
    # ~12 caracteres, no los JWT largos del proveedor local. Un `min_length=20`
    # hacía imposible renovar la sesión en producción (422 en cada intento).
    refresh_token: str = Field(min_length=1, max_length=4096)


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


class FincaCreate(BaseModel):
    """Alta inicial de finca (onboarding del productor, §6).

    `productor_id` y `cooperativa_id` los determina el servidor; por eso
    `extra="forbid"` rechaza cualquier intento del cliente de enviarlos (o de
    enviar `rol`/`organica`). El `id` lo genera el móvil y actúa como clave de
    idempotencia (reintentar con el mismo `id` no duplica).
    """

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    nombre: str = Field(min_length=1, max_length=120)
    municipio: str = Field(min_length=1, max_length=120)
    altitud_min: float | None = Field(default=None, ge=0)
    altitud_max: float | None = Field(default=None, ge=0)

    @field_validator("nombre", "municipio")
    @classmethod
    def _recortar_no_vacio(cls, valor: str) -> str:
        limpio = valor.strip()
        if not limpio:
            raise ValueError("El campo no puede estar vacío.")
        return limpio

    @model_validator(mode="after")
    def _altitudes_coherentes(self) -> FincaCreate:
        if (
            self.altitud_min is not None
            and self.altitud_max is not None
            and self.altitud_min > self.altitud_max
        ):
            raise ValueError("La altitud mínima no puede superar la altitud máxima.")
        return self


class CurrentUser(BaseModel):
    """Usuario autenticado inyectado por `get_current_user`."""

    id: uuid.UUID
    rol: Rol
    email: EmailStr | None = None
