"""Seguridad y autenticación (JWT).

Dos proveedores detrás de la misma interfaz `AuthProvider`:
- `LocalAuthProvider`: firma/valida HS256 con `JWT_SECRET` (solo desarrollo).
- `SupabaseAuthProvider`: valida tokens RS256/ES256 contra el JWKS del proyecto
  Supabase real (producción). El *minting* de tokens lo hace Supabase Auth.

Decisión respaldada en documentación oficial:
- PyJWT (python-jose está abandonado, con CVEs abiertos).
- En producción NO usar HS256 compartido; validar con JWKS.
- El claim `role` de Supabase es "authenticated" (no el rol de negocio); el rol
  de la app se resuelve desde `USUARIOS` por `sub`.
- Contraseñas con Argon2id (OWASP).
"""

from __future__ import annotations

import hashlib
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

import jwt as pyjwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from pydantic import BaseModel, EmailStr

from app.models.dominio import CredencialesInvalidas, Rol, Usuario

if TYPE_CHECKING:
    from app.repositories.interfaces import RepositorioUsuario


class Claims(BaseModel):
    """Claims verificados de un access token (frontera de seguridad)."""

    sub: uuid.UUID
    email: EmailStr | None = None
    exp: int
    iss: str
    typ: str = "access"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


class AuthProvider(ABC):
    """Contrato único de autenticación (DI: el resto del código no sabe el backend)."""

    @abstractmethod
    def login(self, email: str, password: str) -> TokenPair: ...

    @abstractmethod
    def refresh(self, refresh_token: str) -> TokenPair: ...

    @abstractmethod
    def verify(self, token: str) -> Claims: ...

    @abstractmethod
    def register(
        self, email: str, password: str, nombre: str, rol: Rol
    ) -> TokenPair: ...

    @abstractmethod
    def emitir_token_recuperacion(self, email: str) -> str | None:
        """Token one-shot de recuperación, o `None` si el email no existe.

        El endpoint responde igual en ambos casos (no revela si el email está
        registrado); el `None` solo evita emitir un token inútil.
        """

    @abstractmethod
    def restablecer_password(self, token: str, password_nueva: str) -> None:
        """Valida el token de recuperación y actualiza el hash de la contraseña."""


def _huella(password_hash: str) -> str:
    """Huella corta del hash actual, para invalidar el token tras un solo uso."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:32]


class PasswordService:
    """Hash de contraseñas con Argon2id (OWASP recomendación)."""

    def __init__(self) -> None:
        self._hasher = PasswordHasher()

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verificar(self, password: str, encoded: str) -> bool:
        try:
            return self._hasher.verify(encoded, password)
        except (VerifyMismatchError, InvalidHashError):
            return False


class LocalAuthProvider(AuthProvider):
    """Proveedor de desarrollo: emite y valida JWT HS256 con el secreto local."""

    #: Vigencia del token de recuperación (15 min).
    RECOVER_TTL = 900

    def __init__(
        self,
        *,
        secret: str,
        access_ttl: int,
        refresh_ttl: int,
        issuer: str,
        audience: str,
        repo_usuarios: RepositorioUsuario,
        password_service: PasswordService,
    ) -> None:
        self._secret = secret
        self._access_ttl = access_ttl
        self._refresh_ttl = refresh_ttl
        self._issuer = issuer
        self._audience = audience
        self._repo_usuarios = repo_usuarios
        self._password_service = password_service

    def login(self, email: str, password: str) -> TokenPair:
        usuario = self._repo_usuarios.buscar_por_email(email.strip().lower())
        if usuario is None or usuario.password_hash is None:
            raise CredencialesInvalidas("Credenciales inválidas.")
        if not self._password_service.verificar(password, usuario.password_hash):
            raise CredencialesInvalidas("Credenciales inválidas.")
        return self._emitir_par(usuario)

    def register(
        self, email: str, password: str, nombre: str, rol: Rol
    ) -> TokenPair:
        email_norm = email.strip().lower()
        if self._repo_usuarios.buscar_por_email(email_norm) is not None:
            raise CredencialesInvalidas("Credenciales inválidas.")
        if rol == Rol.ADMIN:
            raise CredencialesInvalidas("Credenciales inválidas.")
        hasher = self._password_service
        usuario = Usuario(
            id=uuid.uuid4(),
            email=email_norm,
            rol=rol,
            nombre=nombre.strip(),
            password_hash=hasher.hash(password),
        )
        self._repo_usuarios.guardar(usuario)
        return self._emitir_par(usuario)

    def refresh(self, refresh_token: str) -> TokenPair:
        # Nota (A07): el proveedor local (desarrollo) no rota ni revoca refresh
        # tokens (sin jti-store). En producción, Supabase Auth sí rota/revoca;
        # este proveedor local jamás se usa fuera de dev/CI.
        try:
            payload = pyjwt.decode(
                refresh_token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["sub", "exp", "iat", "iss", "typ"]},
            )
        except pyjwt.PyJWTError as exc:
            raise CredencialesInvalidas("Token de refresco inválido o expirado.") from exc
        if payload.get("typ") != "refresh":
            raise CredencialesInvalidas("Token de refresco inválido.")
        usuario = self._repo_usuarios.buscar_por_id(uuid.UUID(payload["sub"]))
        if usuario is None:
            raise CredencialesInvalidas("Usuario no existe.")
        return self._emitir_par(usuario)

    def verify(self, token: str) -> Claims:
        try:
            payload = pyjwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["sub", "exp", "iat", "iss", "typ"]},
            )
        except pyjwt.PyJWTError as exc:
            raise CredencialesInvalidas("Token inválido o expirado.") from exc
        if payload.get("typ") != "access":
            raise CredencialesInvalidas("Token inválido.")
        return Claims(
            sub=payload["sub"],
            email=payload.get("email"),
            exp=payload["exp"],
            iss=payload["iss"],
            typ=payload.get("typ", "access"),
        )

    def emitir_token_recuperacion(self, email: str) -> str | None:
        usuario = self._repo_usuarios.buscar_por_email(email.strip().lower())
        if usuario is None or usuario.password_hash is None:
            return None
        ahora = int(time.time())
        return pyjwt.encode(
            {
                "sub": str(usuario.id),
                "typ": "recover",
                # Huella del hash actual: al cambiar la contraseña el token deja
                # de validar, lo que lo hace de un solo uso sin almacén de jti.
                "pwh": _huella(usuario.password_hash),
                "iat": ahora,
                "exp": ahora + self.RECOVER_TTL,
                "iss": self._issuer,
                "aud": self._audience,
                "jti": str(uuid.uuid4()),
            },
            self._secret,
            algorithm="HS256",
        )

    def restablecer_password(self, token: str, password_nueva: str) -> None:
        try:
            payload = pyjwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["sub", "exp", "iat", "iss", "typ"]},
            )
        except pyjwt.PyJWTError as exc:
            raise CredencialesInvalidas("Token de recuperación inválido o expirado.") from exc
        if payload.get("typ") != "recover":
            raise CredencialesInvalidas("Token de recuperación inválido.")
        usuario = self._repo_usuarios.buscar_por_id(uuid.UUID(payload["sub"]))
        if usuario is None or usuario.password_hash is None:
            raise CredencialesInvalidas("Token de recuperación inválido.")
        if payload.get("pwh") != _huella(usuario.password_hash):
            raise CredencialesInvalidas("El token de recuperación ya fue utilizado.")
        usuario.password_hash = self._password_service.hash(password_nueva)
        self._repo_usuarios.guardar(usuario)

    def _emitir_par(self, usuario: Usuario) -> TokenPair:
        return TokenPair(
            access_token=self._crear_token(usuario, "access", self._access_ttl),
            refresh_token=self._crear_token(usuario, "refresh", self._refresh_ttl),
            expires_in=self._access_ttl,
        )

    def _crear_token(self, usuario: Usuario, typ: str, ttl: int) -> str:
        ahora = int(time.time())
        return pyjwt.encode(
            {
                "sub": str(usuario.id),
                "email": usuario.email,
                "typ": typ,
                "iat": ahora,
                "exp": ahora + ttl,
                "iss": self._issuer,
                "aud": self._audience,
                "jti": str(uuid.uuid4()),
            },
            self._secret,
            algorithm="HS256",
        )


def _par_desde_respuesta(respuesta, mensaje: str = "Credenciales inválidas.") -> TokenPair:
    """Extrae el par de tokens de un `AuthResponse` del SDK de Supabase.

    El SDK no devuelve la sesión en la raíz: `sign_in_with_password`,
    `sign_up` y `refresh_session` responden un `AuthResponse` cuya sesión vive
    en `.session` (y es `None` si el alta quedó pendiente de confirmar correo).
    """
    sesion = getattr(respuesta, "session", None)
    if sesion is None or not getattr(sesion, "access_token", None):
        raise CredencialesInvalidas(mensaje)
    return TokenPair(
        access_token=sesion.access_token,
        refresh_token=sesion.refresh_token,
        expires_in=sesion.expires_in or 3600,
    )


class SupabaseAuthProvider(AuthProvider):
    """Proveedor de producción: valida JWTs de Supabase Auth con JWKS.

    El login/refresh delega en el cliente de Supabase Auth (sign_in_with_password
    / refresh_session). Requiere un proyecto real; se activa con
    `BEAN_AUTH_BACKEND=supabase` (verificación pendiente en B11).
    """

    def __init__(self, *, url: str, anon_key: str) -> None:
        if not url or not anon_key:
            raise ValueError("SupabaseAuthProvider requiere URL y anon key.")
        self._url = url.rstrip("/")
        self._anon_key = anon_key
        self._issuer = f"{self._url}/auth/v1"
        self._jwks: pyjwt.PyJWKClient | None = None

    def login(self, email: str, password: str) -> TokenPair:
        from supabase import create_client

        try:
            cliente = create_client(self._url, self._anon_key)
            respuesta = cliente.auth.sign_in_with_password(
                {"email": email.strip().lower(), "password": password}
            )
        except Exception as exc:
            raise CredencialesInvalidas("Credenciales inválidas.") from exc
        return _par_desde_respuesta(respuesta)

    def register(
        self, email: str, password: str, nombre: str, rol: Rol
    ) -> TokenPair:
        from supabase import create_client

        if rol == Rol.ADMIN:
            raise CredencialesInvalidas("Credenciales inválidas.")
        try:
            cliente = create_client(self._url, self._anon_key)
            sesion = cliente.auth.sign_up(
                {
                    "email": email.strip().lower(),
                    "password": password,
                    "data": {"nombre": nombre.strip(), "rol": rol.value},
                }
            )
        except Exception as exc:
            raise CredencialesInvalidas("Credenciales inválidas.") from exc
        return _par_desde_respuesta(sesion)

    def emitir_token_recuperacion(self, email: str) -> str | None:
        """Delega en Supabase Auth, que envía el correo de recuperación (B11).

        No devuelve token: el enlace lo emite y entrega Supabase por correo.
        """
        from supabase import create_client

        try:
            cliente = create_client(self._url, self._anon_key)
            cliente.auth.reset_password_email(email.strip().lower())
        except Exception:  # respuesta uniforme: no revelar si el email existe
            return None
        return None

    def restablecer_password(self, token: str, password_nueva: str) -> None:
        """En Supabase el cambio ocurre en el flujo de recuperación del cliente."""
        raise CredencialesInvalidas(
            "Con Supabase Auth el restablecimiento se completa desde el enlace del correo."
        )

    def refresh(self, refresh_token: str) -> TokenPair:
        from supabase import create_client

        try:
            cliente = create_client(self._url, self._anon_key)
            respuesta = cliente.auth.refresh_session(refresh_token)
        except Exception as exc:
            raise CredencialesInvalidas("Sesión expirada.") from exc
        return _par_desde_respuesta(respuesta, "Sesión expirada.")

    def verify(self, token: str) -> Claims:
        if self._jwks is None:
            self._jwks = pyjwt.PyJWKClient(f"{self._url}/auth/v1/.well-known/jwks.json")
        try:
            clave = self._jwks.get_signing_key_from_jwt(token).key
            payload = pyjwt.decode(
                token,
                clave,
                algorithms=["RS256", "ES256"],
                issuer=self._issuer,
                audience="authenticated",
                options={"require": ["sub", "exp", "iss"]},
            )
        except pyjwt.PyJWTError as exc:
            raise CredencialesInvalidas("Token inválido o expirado.") from exc
        return Claims(
            sub=payload["sub"],
            email=payload.get("email"),
            exp=payload["exp"],
            iss=payload["iss"],
        )
