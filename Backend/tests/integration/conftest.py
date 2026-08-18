"""Fixtures de integración: TestClient con almacenes en memoria aislados.

Cada test recibe un `client` con repositorios frescos (misma config de
producción que el store por defecto), de modo que los casos no comparten
estado. Las contraseñas se hashean una sola vez y se reutilizan.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.seguridad import LocalAuthProvider, PasswordService
from app.main import crear_app
from app.models.dominio import Finca, Rol, Usuario
from app.repositories.in_memory import (
    InMemoryFincaRepo,
    InMemoryLoteRepo,
    InMemoryPagoRepo,
    InMemoryQRRepo,
    InMemoryUsuarioRepo,
    Memoria,
)

pytestmark = pytest.mark.integration


@pytest.fixture(scope="session")
def seed_usuarios() -> list[Usuario]:
    hasher = PasswordService()
    return [
        Usuario(
            uuid.uuid4(),
            "admin@beantrust.dev",
            Rol.ADMIN,
            "Administrador",
            hasher.hash("Admin123!"),
        ),
        Usuario(
            uuid.uuid4(),
            "cooperativa@beantrust.dev",
            Rol.COOPERATIVA,
            "Café Veracruz",
            hasher.hash("Coop123!"),
        ),
        Usuario(
            uuid.uuid4(),
            "productor@beantrust.dev",
            Rol.PRODUCTOR,
            "Juan Pérez",
            hasher.hash("Prod123!"),
        ),
        Usuario(
            uuid.uuid4(),
            "comprador@beantrust.dev",
            Rol.COMPRADOR,
            "Comercializadora de Altura",
            hasher.hash("Comp123!"),
        ),
    ]


@pytest.fixture
def memoria(seed_usuarios: list[Usuario]) -> Memoria:
    memoria = Memoria()
    for usuario in seed_usuarios:
        memoria.usuarios[usuario.id] = usuario
    productor = next(u for u in seed_usuarios if u.rol is Rol.PRODUCTOR)
    cooperativa = next(u for u in seed_usuarios if u.rol is Rol.COOPERATIVA)
    memoria.fincas[uuid.UUID("11111111-1111-1111-1111-111111111111")] = Finca(
        id=uuid.UUID("11111111-1111-1111-1111-111111111111"),
        productor_id=productor.id,
        cooperativa_id=cooperativa.id,
        nombre="Finca La Esperanza",
        municipio="Coatepec",
        organica=True,
    )
    coop2 = Usuario(
        uuid.uuid4(),
        "cooperativa2@beantrust.dev",
        Rol.COOPERATIVA,
        "Café Altura",
        None,
    )
    memoria.usuarios[coop2.id] = coop2
    memoria.fincas[uuid.UUID("22222222-2222-2222-2222-222222222222")] = Finca(
        id=uuid.UUID("22222222-2222-2222-2222-222222222222"),
        productor_id=productor.id,
        cooperativa_id=coop2.id,
        nombre="Finca El Encanto",
        municipio="Xico",
        organica=True,
    )
    return memoria


@pytest.fixture
def client(memoria: Memoria, seed_usuarios: list[Usuario]):
    from app import dependencies as deps

    deps._limiter_login.cache_clear()
    repo_usuario = InMemoryUsuarioRepo(memoria)

    app = crear_app()
    app.dependency_overrides[deps.get_repo_lote] = lambda: InMemoryLoteRepo(memoria)
    app.dependency_overrides[deps.get_repo_qr] = lambda: InMemoryQRRepo(memoria)
    app.dependency_overrides[deps.get_repo_pago] = lambda: InMemoryPagoRepo(memoria)
    app.dependency_overrides[deps.get_repo_finca] = lambda: InMemoryFincaRepo(memoria)
    app.dependency_overrides[deps.get_repo_usuario] = lambda: repo_usuario
    app.dependency_overrides[deps.get_auth_provider] = lambda: LocalAuthProvider(
        secret="secreto-de-test-de-32-bytes-al-menos-ok",
        access_ttl=3600,
        refresh_ttl=2592000,
        issuer="beantrust-test",
        audience="beantrust-test",
        repo_usuarios=repo_usuario,
        password_service=PasswordService(),
    )
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def finca_id() -> uuid.UUID:
    return uuid.UUID("11111111-1111-1111-1111-111111111111")


def login(client: TestClient, email: str, password: str) -> dict[str, str]:
    r = client.post("/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def header_productor(client: TestClient) -> dict[str, str]:
    return login(client, "productor@beantrust.dev", "Prod123!")


@pytest.fixture
def header_cooperativa(client: TestClient) -> dict[str, str]:
    return login(client, "cooperativa@beantrust.dev", "Coop123!")


@pytest.fixture
def header_admin(client: TestClient) -> dict[str, str]:
    return login(client, "admin@beantrust.dev", "Admin123!")


@pytest.fixture
def header_comprador(client: TestClient) -> dict[str, str]:
    return login(client, "comprador@beantrust.dev", "Comp123!")