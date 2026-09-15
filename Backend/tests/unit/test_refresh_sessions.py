"""Refresh tokens: rotación, detección de reuso y revocación (A07)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest

from app.core.seguridad import LocalAuthProvider, PasswordService
from app.models.dominio import CredencialesInvalidas, Rol, Usuario
from app.repositories.in_memory import (
    InMemorySesionRefreshRepo,
    InMemoryUsuarioRepo,
    Memoria,
)
from app.repositories.sesiones import SesionRefresh

SECRET = "secreto-de-test-de-32-bytes-al-menos-ok"
ISSUER = "beantrust-test"
AUDIENCE = "beantrust-test"


def _sesion(
    *,
    jti: uuid.UUID | None = None,
    familia: uuid.UUID | None = None,
    usuario: uuid.UUID | None = None,
) -> SesionRefresh:
    return SesionRefresh(
        jti=jti or uuid.uuid4(),
        familia_id=familia or uuid.uuid4(),
        usuario_id=usuario or uuid.uuid4(),
        expira_en=datetime.now(UTC) + timedelta(hours=1),
    )


def test_crear_y_buscar() -> None:
    repo = InMemorySesionRefreshRepo()
    sesion = _sesion()
    repo.crear(sesion)
    assert repo.buscar(sesion.jti) is sesion
    assert repo.buscar(uuid.uuid4()) is None


def test_consumir_solo_una_vez() -> None:
    repo = InMemorySesionRefreshRepo()
    sesion = _sesion()
    repo.crear(sesion)
    assert repo.consumir(sesion.jti) is True
    assert repo.consumir(sesion.jti) is False


def test_revocar_familia_invalida_solo_su_familia() -> None:
    repo = InMemorySesionRefreshRepo()
    familia = uuid.uuid4()
    primera = _sesion(familia=familia)
    segunda = _sesion(familia=familia)
    ajena = _sesion()
    for sesion in (primera, segunda, ajena):
        repo.crear(sesion)
    repo.revocar_familia(familia)
    assert repo.consumir(primera.jti) is False
    assert repo.consumir(segunda.jti) is False
    assert repo.consumir(ajena.jti) is True


def test_revocar_usuario_invalida_todas_sus_sesiones() -> None:
    repo = InMemorySesionRefreshRepo()
    usuario = uuid.uuid4()
    propia = _sesion(usuario=usuario)
    otra = _sesion()
    repo.crear(propia)
    repo.crear(otra)
    repo.revocar_usuario(usuario)
    assert repo.consumir(propia.jti) is False
    assert repo.consumir(otra.jti) is True


def _provider() -> tuple[LocalAuthProvider, Usuario, InMemorySesionRefreshRepo]:
    hasher = PasswordService()
    usuario = Usuario(
        uuid.uuid4(), "prod@test.dev", Rol.PRODUCTOR, "Prod", hasher.hash("Prod123!")
    )
    memoria = Memoria()
    memoria.usuarios[usuario.id] = usuario
    sesiones = InMemorySesionRefreshRepo()
    provider = LocalAuthProvider(
        secret=SECRET,
        access_ttl=3600,
        refresh_ttl=2592000,
        issuer=ISSUER,
        audience=AUDIENCE,
        repo_usuarios=InMemoryUsuarioRepo(memoria),
        password_service=hasher,
        repo_sesiones=sesiones,
    )
    return provider, usuario, sesiones


def _claims(token: str) -> dict:
    return pyjwt.decode(token, SECRET, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER)


def test_login_emite_refresh_con_jti_y_familia() -> None:
    provider, usuario, _ = _provider()
    par = provider.login("prod@test.dev", "Prod123!")
    payload = _claims(par.refresh_token)
    assert payload["typ"] == "refresh"
    assert uuid.UUID(payload["jti"])
    assert uuid.UUID(payload["family"])
    assert payload["sub"] == str(usuario.id)


def test_refresh_rota_conservando_la_familia() -> None:
    provider, _, _ = _provider()
    par = provider.login("prod@test.dev", "Prod123!")
    nuevo = provider.refresh(par.refresh_token)
    assert nuevo.access_token != par.access_token
    assert nuevo.refresh_token != par.refresh_token
    assert _claims(nuevo.refresh_token)["family"] == _claims(par.refresh_token)["family"]


def test_reuso_revoca_la_familia_y_el_refresh_nuevo() -> None:
    provider, _, _ = _provider()
    par = provider.login("prod@test.dev", "Prod123!")
    nuevo = provider.refresh(par.refresh_token)
    with pytest.raises(CredencialesInvalidas):
        provider.refresh(par.refresh_token)
    with pytest.raises(CredencialesInvalidas):
        provider.refresh(nuevo.refresh_token)


def test_restablecer_password_revoca_los_refresh() -> None:
    provider, _, _ = _provider()
    par = provider.login("prod@test.dev", "Prod123!")
    token = provider.emitir_token_recuperacion("prod@test.dev")
    provider.restablecer_password(token, "NuevaClave123!")
    with pytest.raises(CredencialesInvalidas):
        provider.refresh(par.refresh_token)


def test_refresh_con_typ_distinto_se_rechaza() -> None:
    provider, _, _ = _provider()
    par = provider.login("prod@test.dev", "Prod123!")
    with pytest.raises(CredencialesInvalidas):
        provider.refresh(par.access_token)
