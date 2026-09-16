#!/usr/bin/env python3
"""Smoke test operativo contra un despliegue real de BeanTrust.

Recorre el flujo vertical mínimo del "Día 1" a producción:

    login -> /v1/auth/me -> /v1/fincas -> alta de lote (idempotente)
    -> DESPULPADO -> DESCASCARADO -> TOSTADO -> certificado -> /v1/verificar

No lleva credenciales embebidas: todo entra por variables de entorno.

    BEAN_SMOKE_BASE_URL          p. ej. https://beantrust-api.vercel.app
    BEAN_SMOKE_PRODUCER_EMAIL    cuenta piloto con rol productor
    BEAN_SMOKE_PRODUCER_PASSWORD contraseña de esa cuenta

El lote y los eventos usan UUID fijos, así que puede ejecutarse repetidamente
sobre el mismo backend sin crear basura (el alta y los eventos son idempotentes).

Solo imprime códigos HTTP, conteos y hashes públicos; nunca tokens ni
contraseñas. Sale con código 0 si todo cuadra y distinto de 0 si algo falla.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import UTC, datetime
from typing import Any

# ------------------------------------------------------------------ canónicos fijos

LOTE_ID = "f0000000-0000-4000-8000-000000000001"
EVENTO_DESPULPADO_ID = "f0000000-0000-4000-8000-000000000002"
EVENTO_DESCASCARADO_ID = "f0000000-0000-4000-8000-000000000003"
EVENTO_TOSTADO_ID = "f0000000-0000-4000-8000-000000000004"
FECHA_COSECHA = "2026-01-15"

# Evidencia fotográfica (ADR-14): lote canónico propio para no ensuciar el
# lote de trazabilidad. Ambos UUID fijos => el smoke es repetible.
LOTE_EVIDENCIA_ID = "f0000000-0000-4000-8000-000000000011"
EVIDENCIA_ID = "f0000000-0000-4000-8000-000000000012"
JPEG_MINIMO = b"\xff\xd8\xff\xe0" + b"\x00" * 512

# Orden esperado de la cadena de trazabilidad hasta el certificado.
SECUENCIA = ["COSECHA", "DESPULPADO", "DESCASCARADO", "TOSTADO"]

# Campos que entran al hash de etapa (ADR-11); deben replicar el dominio.
CAMPOS_HASH = [
    "tipo",
    "de_estado",
    "a_estado",
    "actor_id",
    "peso_kg",
    "merma_pct",
    "metodo_beneficiado",
    "metodo_fermentacion",
    "fermentacion_horas",
    "humedad_inicial_pct",
    "humedad_final_pct",
    "metodo_secado",
    "dias_reposo",
    "puntaje_sca",
    "defectos",
    "densidad",
    "tamiz",
    "comprador_id",
]

TIMEOUT_S = 30


class SmokeError(RuntimeError):
    """Fallo de aserción del smoke test."""


def _base_url() -> str:
    valor = os.environ.get("BEAN_SMOKE_BASE_URL", "").strip().rstrip("/")
    if not valor:
        raise SystemExit("Falta BEAN_SMOKE_BASE_URL.")
    return valor


def _credenciales() -> tuple[str, str]:
    email = os.environ.get("BEAN_SMOKE_PRODUCER_EMAIL", "").strip()
    password = os.environ.get("BEAN_SMOKE_PRODUCER_PASSWORD", "")
    if not email or not password:
        raise SystemExit(
            "Faltan BEAN_SMOKE_PRODUCER_EMAIL y/o BEAN_SMOKE_PRODUCER_PASSWORD."
        )
    return email, password


def _peticion(
    metodo: str,
    ruta: str,
    *,
    token: str | None = None,
    body: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> tuple[int, Any]:
    """Devuelve (status_code, payload). No lanza por HTTP != 2xx."""
    datos = json.dumps(body).encode("utf-8") if body is not None else None
    cabeceras = {"Accept": "application/json"}
    if datos is not None:
        cabeceras["Content-Type"] = "application/json"
    if token:
        cabeceras["Authorization"] = f"Bearer {token}"
    if idempotency_key:
        cabeceras["Idempotency-Key"] = idempotency_key

    peticion = urllib.request.Request(
        f"{_base_url()}{ruta}", data=datos, headers=cabeceras, method=metodo
    )
    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_S) as respuesta:
            crudo = respuesta.read().decode("utf-8")
            return respuesta.status, json.loads(crudo) if crudo else None
    except urllib.error.HTTPError as exc:
        crudo = exc.read().decode("utf-8")
        try:
            payload = json.loads(crudo) if crudo else None
        except json.JSONDecodeError:
            payload = crudo
        return exc.code, payload


def _exigir(condicion: bool, mensaje: str) -> None:
    if not condicion:
        raise SmokeError(mensaje)


def _log(mensaje: str) -> None:
    print(f"  {mensaje}", flush=True)


def _peticion_multipart(
    ruta: str,
    *,
    token: str,
    campos: dict[str, str],
    archivo: bytes,
    nombre_archivo: str,
    content_type: str,
    idempotency_key: str,
) -> tuple[int, Any]:
    """POST multipart manual (el smoke no depende de `requests`)."""
    boundary = "----beantrust" + uuid.uuid4().hex
    partes = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{clave}"\r\n\r\n{valor}\r\n'
        for clave, valor in campos.items()
    ]
    partes.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="archivo"; '
        f'filename="{nombre_archivo}"\r\nContent-Type: {content_type}\r\n\r\n'
    )
    cuerpo = "".join(partes).encode() + archivo + f"\r\n--{boundary}--\r\n".encode()
    peticion = urllib.request.Request(
        f"{_base_url()}{ruta}",
        data=cuerpo,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": idempotency_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_S) as respuesta:
            crudo = respuesta.read().decode("utf-8")
            return respuesta.status, json.loads(crudo) if crudo else None
    except urllib.error.HTTPError as exc:
        crudo = exc.read().decode("utf-8")
        return exc.code, json.loads(crudo) if crudo else None


def _iso_utc(valor: str) -> str:
    """Normaliza el timestamp del API al mismo formato que el dominio."""
    normalizado = valor.replace("Z", "+00:00")
    return datetime.fromisoformat(normalizado).astimezone(UTC).isoformat()


def _hash_etapa(evento: dict[str, Any], hash_anterior: str) -> str:
    """Replica `Lote._calcular_hash_etapa` para validar la cadena (ADR-11)."""
    payload = {campo: evento.get(campo) for campo in CAMPOS_HASH}
    payload["registrado_en"] = _iso_utc(evento["registrado_en"])
    datos = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256((hash_anterior + datos).encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ pasos


def autenticar() -> str:
    email, password = _credenciales()
    status, payload = _peticion(
        "POST", "/v1/auth/login", body={"email": email, "password": password}
    )
    _exigir(status == 200, f"login devolvió {status}, se esperaba 200.")
    _exigir(bool(payload and payload.get("access_token")), "login sin access_token.")
    _log(f"POST /v1/auth/login -> {status}")
    return payload["access_token"]


def perfil(token: str) -> None:
    status, payload = _peticion("GET", "/v1/auth/me", token=token)
    _exigir(status == 200, f"/v1/auth/me devolvió {status}, se esperaba 200.")
    _exigir(payload.get("rol") == "productor", f"rol inesperado: {payload.get('rol')!r}.")
    _log(f"GET /v1/auth/me -> {status} (rol=productor)")


def resolver_finca(token: str) -> str:
    status, payload = _peticion("GET", "/v1/fincas", token=token)
    _exigir(status == 200, f"/v1/fincas devolvió {status}, se esperaba 200.")
    _exigir(isinstance(payload, list) and len(payload) > 0, "el productor no tiene fincas.")
    finca_id = payload[0]["id"]
    _log(f"GET /v1/fincas -> {status} ({len(payload)} finca(s))")
    return finca_id


def crear_lote_idempotente(token: str, finca_id: str) -> None:
    cuerpo = {
        "id": LOTE_ID,
        "finca_id": finca_id,
        "fecha_cosecha": FECHA_COSECHA,
        "peso_kg": 100.0,
        "variedad": "Typica",
        "metodo_beneficiado": "lavado",
    }
    for intento in (1, 2):
        status, payload = _peticion("POST", "/v1/lotes", token=token, body=cuerpo)
        _exigir(status == 201, f"alta de lote (intento {intento}) devolvió {status}.")
        _exigir(payload.get("id") == LOTE_ID, "el lote devuelto no es el canónico.")
    _log(f"POST /v1/lotes x2 -> 201 (idempotente, id={LOTE_ID})")

    detalle = obtener_lote(token)
    cosechas = [e for e in detalle["historial"] if e["tipo"] == "COSECHA"]
    _exigir(len(cosechas) == 1, f"se esperaba 1 COSECHA, hay {len(cosechas)}.")

    status, pagina = _peticion("GET", "/v1/lotes?limit=100", token=token)
    _exigir(status == 200, f"/v1/lotes devolvió {status}.")
    repetidos = [lote for lote in pagina["items"] if lote["id"] == LOTE_ID]
    _exigir(len(repetidos) == 1, f"el lote canónico aparece {len(repetidos)} veces.")
    _log("GET /v1/lotes -> 200 (el lote canónico aparece 1 vez)")


def registrar_evento(token: str, tipo: str, evento_id: str, peso_kg: float) -> None:
    status, _ = _peticion(
        "POST",
        f"/v1/lotes/{LOTE_ID}/eventos",
        token=token,
        idempotency_key=evento_id,
        body={"tipo": tipo, "peso_kg": peso_kg},
    )
    _exigir(status == 201, f"evento {tipo} devolvió {status}, se esperaba 201.")
    _log(f"POST /v1/lotes/{{id}}/eventos {tipo} -> {status}")


def obtener_lote(token: str) -> dict[str, Any]:
    status, payload = _peticion("GET", f"/v1/lotes/{LOTE_ID}", token=token)
    _exigir(status == 200, f"detalle del lote devolvió {status}, se esperaba 200.")
    return payload


def validar_cadena(token: str) -> str:
    detalle = obtener_lote(token)
    _exigir(detalle["estado"] == "TOSTADO", f"estado final inesperado: {detalle['estado']}.")

    historial = detalle["historial"]
    tipos = [evento["tipo"] for evento in historial]
    _exigir(tipos == SECUENCIA, f"orden inesperado del historial: {tipos}.")

    hash_anterior = ""
    for evento in historial:
        hash_esperado = _hash_etapa(evento, hash_anterior)
        _exigir(
            evento.get("hash_etapa") == hash_esperado,
            f"hash_etapa inválido en {evento['tipo']}.",
        )
        _exigir(len(hash_esperado) == 64, "hash_etapa no es SHA-256.")
        hash_anterior = hash_esperado
    _log(f"GET /v1/lotes/{{id}} -> 200 (TOSTADO, {len(historial)} eventos, cadena íntegra)")

    certificado = detalle.get("certificado")
    _exigir(certificado and certificado.get("codigo"), "el lote no emitió certificado.")
    return certificado["codigo"]


def verificar_publico(codigo: str, hash_certificado: str) -> None:
    status, payload = _peticion("GET", f"/v1/verificar/{codigo}")
    _exigir(status == 200, f"/v1/verificar/{{codigo}} devolvió {status}, se esperaba 200.")
    _exigir(payload.get("lote_id") == LOTE_ID, "el certificado apunta a otro lote.")
    _exigir(payload.get("estado") == "TOSTADO", "el pasaporte público no está TOSTADO.")
    _exigir(
        payload.get("hash_sha256") == hash_certificado,
        "el hash público no coincide con el certificado.",
    )
    _log(f"GET /v1/verificar/{{codigo}} -> {status} (sin token, hash coincide)")


def subir_evidencia(token: str, finca_id: str) -> None:
    """Sube una foto al bucket privado (idempotente por Idempotency-Key)."""
    status, payload = _peticion_multipart(
        "/v1/evidencias",
        token=token,
        campos={"finca_id": finca_id, "lote_id": LOTE_EVIDENCIA_ID},
        archivo=JPEG_MINIMO,
        nombre_archivo=f"{EVIDENCIA_ID}.jpg",
        content_type="image/jpeg",
        idempotency_key=EVIDENCIA_ID,
    )
    _exigir(status == 201, f"subida de evidencia devolvió {status}.")
    sha = hashlib.sha256(JPEG_MINIMO).hexdigest()
    _exigir(payload.get("evidencia_sha256") == sha, "el SHA-256 de la evidencia no coincide.")
    _exigir(payload.get("size_bytes") == len(JPEG_MINIMO), "tamaño de evidencia inesperado.")
    _log(f"POST /v1/evidencias -> {status} (SHA-256 y tamaño verificados)")


def crear_lote_con_evidencia(token: str, finca_id: str) -> None:
    status, payload = _peticion(
        "POST",
        "/v1/lotes",
        token=token,
        idempotency_key=LOTE_EVIDENCIA_ID,
        body={
            "id": LOTE_EVIDENCIA_ID,
            "finca_id": finca_id,
            "fecha_cosecha": FECHA_COSECHA,
            "peso_kg": 10.0,
            "evidencia_id": EVIDENCIA_ID,
        },
    )
    _exigir(status == 201, f"alta de lote con evidencia devolvió {status}.")
    _exigir(bool(payload.get("evidencia_sha256")), "el lote no heredó el SHA de la evidencia.")
    _log(f"POST /v1/lotes (con evidencia) -> {status}")


def obtener_url_evidencia(token: str) -> None:
    status, payload = _peticion("GET", f"/v1/lotes/{LOTE_EVIDENCIA_ID}/evidencia", token=token)
    _exigir(status == 200, f"GET evidencia devolvió {status}.")
    sha = hashlib.sha256(JPEG_MINIMO).hexdigest()
    _exigir(payload.get("evidencia_sha256") == sha, "la URL no corresponde a la evidencia.")
    url = payload.get("url")
    _exigir(bool(url), "la respuesta no trae URL firmada.")
    with urllib.request.urlopen(url, timeout=TIMEOUT_S) as respuesta:
        binario = respuesta.read()
    _exigir(binario.startswith(b"\xff\xd8\xff"), "la URL firmada no sirve un JPEG.")
    _log(f"GET /v1/lotes/{{id}}/evidencia -> {status} (URL firmada sirve el binario)")


def main() -> int:
    print("BeanTrust · smoke test de producción", flush=True)
    try:
        token = autenticar()
        perfil(token)
        finca_id = resolver_finca(token)
        crear_lote_idempotente(token, finca_id)

        registrar_evento(token, "DESPULPADO", EVENTO_DESPULPADO_ID, 90.0)
        registrar_evento(token, "DESCASCARADO", EVENTO_DESCASCARADO_ID, 70.0)
        registrar_evento(token, "TOSTADO", EVENTO_TOSTADO_ID, 60.0)

        detalle = obtener_lote(token)
        certificado = detalle.get("certificado") or {}
        codigo = validar_cadena(token)
        verificar_publico(codigo, certificado["hash_sha256"])

        subir_evidencia(token, finca_id)
        crear_lote_con_evidencia(token, finca_id)
        obtener_url_evidencia(token)
    except SmokeError as exc:
        print(f"\nFALLO: {exc}", file=sys.stderr, flush=True)
        return 1
    except urllib.error.URLError as exc:
        print(f"\nFALLO de red: {exc.reason}", file=sys.stderr, flush=True)
        return 1

    print(
        "\nOK: flujo Android -> API -> lote -> eventos -> certificado -> QR verificado; "
        "evidencia subida y servida por URL firmada.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
