"""Fixtures de integración: TestClient con almacenes en memoria aislados.

Cada test recibe un `client` con repositorios frescos (misma config de
producción que el store por defecto), de modo que los casos no comparten
estado. Las contraseñas se hashean una sola vez y se reutilizan.
"""

from __future__ import annotations

import uuid
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.core.seguridad import LocalAuthProvider, PasswordService
from app.main import crear_app
from app.models.dominio import Finca, Rol, Usuario
from app.repositories.evidencia import InMemoryAlmacenEvidencia
from app.repositories.in_memory import (
    FakeGatewayTrazabilidad,
    InMemoryAnclaRepo,
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
from app.repositories.rate_limit import InMemoryRateLimitRepo

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
    # Copia por test: `seed_usuarios` es session-scoped y los `Usuario` son
    # mutables (p.ej. recover cambia `password_hash`). Sin la copia, un test
    # que altere credenciales rompería los siguientes.
    for usuario in seed_usuarios:
        memoria.usuarios[usuario.id] = replace(usuario)
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
def gateway_trazabilidad() -> FakeGatewayTrazabilidad:
    """Gateway de anclaje compartido por test (el estado on-chain persiste)."""
    return FakeGatewayTrazabilidad()


@pytest.fixture
def client(
    memoria: Memoria,
    seed_usuarios: list[Usuario],
    gateway_trazabilidad: FakeGatewayTrazabilidad,
):
    from app import dependencies as deps

    # Estado de proceso compartido entre requests: se aísla por test.
    deps._rate_limit_global = None
    deps._sesiones_refresh_global = None
    deps._almacen_evidencia_global = None
    repo_usuario = InMemoryUsuarioRepo(memoria)
    sesiones = InMemorySesionRefreshRepo()
    rate_limit = InMemoryRateLimitRepo()
    almacen_evidencia = InMemoryAlmacenEvidencia()

    app = crear_app()
    # Repos de servicio (auth interna + verificación pública).
    app.dependency_overrides[deps.get_repo_lote] = lambda: InMemoryLoteRepo(memoria)
    app.dependency_overrides[deps.get_repo_qr] = lambda: InMemoryQRRepo(memoria)
    app.dependency_overrides[deps.get_repo_pago] = lambda: InMemoryPagoRepo(memoria)
    app.dependency_overrides[deps.get_repo_propina] = lambda: InMemoryPropinaRepo(memoria)
    app.dependency_overrides[deps.get_repo_finca] = lambda: InMemoryFincaRepo(memoria)
    app.dependency_overrides[deps.get_repo_usuario] = lambda: repo_usuario
    # Repos autenticados (cliente con JWT del usuario).
    app.dependency_overrides[deps.get_repo_lote_usuario] = lambda: InMemoryLoteRepo(memoria)
    app.dependency_overrides[deps.get_repo_qr_usuario] = lambda: InMemoryQRRepo(memoria)
    app.dependency_overrides[deps.get_repo_pago_usuario] = lambda: InMemoryPagoRepo(memoria)
    app.dependency_overrides[deps.get_repo_propina_usuario] = lambda: InMemoryPropinaRepo(memoria)
    app.dependency_overrides[deps.get_repo_finca_usuario] = lambda: InMemoryFincaRepo(memoria)
    app.dependency_overrides[deps.get_repo_usuario_usuario] = lambda: repo_usuario
    app.dependency_overrides[deps.get_repo_evidencia] = lambda: InMemoryEvidenciaRepo(memoria)
    app.dependency_overrides[deps.get_almacen_evidencia] = lambda: almacen_evidencia
    app.dependency_overrides[deps.get_repo_anclas] = lambda: InMemoryAnclaRepo(memoria)
    app.dependency_overrides[deps.get_gateway_trazabilidad] = lambda: gateway_trazabilidad
    app.dependency_overrides[deps.get_repo_rate_limit] = lambda: rate_limit
    app.dependency_overrides[deps.get_auth_provider] = lambda: LocalAuthProvider(
        secret="secreto-de-test-de-32-bytes-al-menos-ok",
        access_ttl=3600,
        refresh_ttl=2592000,
        issuer="beantrust-test",
        audience="beantrust-test",
        repo_usuarios=repo_usuario,
        password_service=PasswordService(),
        repo_sesiones=sesiones,
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

FINCA_PRINCIPAL = "11111111-1111-1111-1111-111111111111"


def crear_lote_tostado(client: TestClient, header: dict[str, str], peso: float = 500.0) -> dict:
    """Crea un lote y lo lleva hasta TOSTADO (emite certificado QR).

    Compartido por los tests de pagos, propinas y saldo para no repetir la
    misma escalera de eventos en cada módulo.
    """
    r = client.post(
        "/v1/lotes",
        headers=header,
        json={"finca_id": FINCA_PRINCIPAL, "fecha_cosecha": "2026-08-01", "peso_kg": peso},
    )
    assert r.status_code == 201, r.text
    lote = r.json()
    for tipo, siguiente in [
        ("DESPULPADO", peso * 0.96),
        ("DESCASCARADO", peso * 0.90),
        ("TOSTADO", peso * 0.84),
    ]:
        r = client.post(
            f"/v1/lotes/{lote['id']}/eventos",
            headers={**header, "Idempotency-Key": str(uuid.uuid4())},
            json={"tipo": tipo, "peso_kg": round(siguiente, 2)},
        )
        assert r.status_code == 201, r.text
    return lote


def crear_lote_vendido(
    client: TestClient,
    header_productor: dict[str, str],
    header_cooperativa: dict[str, str],
    comprador_id: str,
    monto_total: float = 5000.0,
    peso: float = 400.0,
) -> dict:
    """Lote TOSTADO + venta registrada (`POST /v1/pagos`, 202)."""
    lote = crear_lote_tostado(client, header_productor, peso=peso)
    r = client.post(
        "/v1/pagos",
        headers={**header_cooperativa, "Idempotency-Key": str(uuid.uuid4())},
        json={"lote_id": lote["id"], "comprador_id": comprador_id, "monto_total": monto_total},
    )
    assert r.status_code == 202, r.text
    return lote
