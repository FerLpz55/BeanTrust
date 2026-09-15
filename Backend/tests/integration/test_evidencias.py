"""E2E de evidencia fotográfica privada (ADR-14, §6).

El móvil sube el binario por `POST /v1/evidencias`, referencia el `id` al crear
el lote y luego pide una URL firmada por `GET /v1/lotes/{lote_id}/evidencia`.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

FINCA = "11111111-1111-1111-1111-111111111111"
FINCA_AJENA = "22222222-2222-2222-2222-222222222222"
# Firmas mínimas: solo necesitan pasar la validación de *magic bytes*.
PNG_MINIMO = b"\x89PNG\r\n\x1a\n" + b"0" * 16
WEBP_MINIMO = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"0" * 8


def _subir(
    client: TestClient,
    header: dict[str, str],
    *,
    finca: str = FINCA,
    lote_id: str | None = None,
    contenido: bytes = PNG_MINIMO,
    content_type: str = "image/png",
    nombre: str = "foto.png",
    clave: str | None = None,
):
    return client.post(
        "/v1/evidencias",
        headers={**header, "Idempotency-Key": clave or str(uuid.uuid4())},
        data={"finca_id": finca, "lote_id": lote_id or str(uuid.uuid4())},
        files={"archivo": (nombre, contenido, content_type)},
    )


def test_subir_adjuntar_y_leer_evidencia(client, header_productor):
    lote_id = str(uuid.uuid4())
    r = _subir(client, header_productor, lote_id=lote_id)
    assert r.status_code == 201, r.text
    evidencia = r.json()
    assert evidencia["estado"] == "PENDIENTE"
    assert evidencia["content_type"] == "image/png"
    assert evidencia["size_bytes"] == len(PNG_MINIMO)

    r = client.post(
        "/v1/lotes",
        headers=header_productor,
        json={
            "id": lote_id,
            "finca_id": FINCA,
            "fecha_cosecha": "2026-08-01",
            "peso_kg": 100.0,
            "evidencia_id": evidencia["id"],
        },
    )
    assert r.status_code == 201, r.text
    lote = r.json()
    assert lote["evidencia_url"] == evidencia["evidencia_url"]
    assert lote["evidencia_sha256"] == evidencia["evidencia_sha256"]

    r = client.get(f"/v1/lotes/{lote_id}/evidencia", headers=header_productor)
    assert r.status_code == 200, r.text
    firmada = r.json()
    assert firmada["url"].startswith("https://storage.local/")
    assert firmada["evidencia_sha256"] == evidencia["evidencia_sha256"]


def test_subida_idempotente_no_duplica(client, header_productor):
    lote_id = str(uuid.uuid4())
    clave = str(uuid.uuid4())
    primero = _subir(client, header_productor, lote_id=lote_id, clave=clave)
    segundo = _subir(client, header_productor, lote_id=lote_id, clave=clave)
    assert primero.status_code == 201, primero.text
    assert segundo.status_code == 201, segundo.text
    assert primero.json()["id"] == segundo.json()["id"]


def test_replay_de_otro_usuario_no_devuelve_la_evidencia(
    client, header_productor, header_admin
):
    clave = str(uuid.uuid4())
    lote_id = str(uuid.uuid4())
    assert _subir(client, header_productor, lote_id=lote_id, clave=clave).status_code == 201
    # Misma clave, otro usuario: no puede leer la evidencia ajena.
    r = _subir(client, header_admin, lote_id=lote_id, clave=clave)
    assert r.status_code == 403


def test_tipo_no_permitido(client, header_productor):
    r = _subir(
        client,
        header_productor,
        contenido=b"GIF89a",
        content_type="image/gif",
        nombre="x.gif",
    )
    assert r.status_code == 422


def test_firma_no_coincide_con_el_mime(client, header_productor):
    r = _subir(client, header_productor, contenido=b"no-es-png", content_type="image/png")
    assert r.status_code == 422


def test_archivo_demasiado_grande(client, header_productor):
    r = _subir(client, header_productor, contenido=PNG_MINIMO + b"0" * (5 * 1024 * 1024))
    assert r.status_code == 422


def test_webp_valido(client, header_productor):
    r = _subir(
        client,
        header_productor,
        contenido=WEBP_MINIMO,
        content_type="image/webp",
        nombre="foto.webp",
    )
    assert r.status_code == 201, r.text


def test_finca_ajena_no_autorizada(client, header_cooperativa):
    r = _subir(client, header_cooperativa, finca=FINCA_AJENA)
    assert r.status_code == 403


def test_evidencia_de_otro_lote_no_se_adjunta(client, header_productor):
    lote_id = str(uuid.uuid4())
    r = _subir(client, header_productor, lote_id=lote_id)
    assert r.status_code == 201
    evidencia_id = r.json()["id"]
    r = client.post(
        "/v1/lotes",
        headers=header_productor,
        json={
            "id": str(uuid.uuid4()),  # otro lote distinto al de la evidencia
            "finca_id": FINCA,
            "fecha_cosecha": "2026-08-01",
            "peso_kg": 10.0,
            "evidencia_id": evidencia_id,
        },
    )
    assert r.status_code == 403


def test_lote_sin_evidencia_devuelve_404(client, header_productor):
    r = client.post(
        "/v1/lotes",
        headers=header_productor,
        json={"finca_id": FINCA, "fecha_cosecha": "2026-08-01", "peso_kg": 10.0},
    )
    assert r.status_code == 201, r.text
    lote_id = r.json()["id"]
    r = client.get(f"/v1/lotes/{lote_id}/evidencia", headers=header_productor)
    assert r.status_code == 404
