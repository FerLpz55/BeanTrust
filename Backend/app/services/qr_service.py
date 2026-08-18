"""Servicio del certificado de origen (QR, §8).

El backend solo persiste `codigo` + `hash_sha256`; la imagen del QR la
renderiza el cliente. El hash permite detectar manipulación del historial.
"""

from __future__ import annotations

import hashlib
import json
import uuid

from app.models.dominio import CertificadoQR, Lote


class QrService:
    def generar_codigo_publico(self) -> str:
        """Código público del lote (identificador corto y legible)."""
        return "LT-" + uuid.uuid4().hex[:10].upper()

    def generar_codigo_certificado(self) -> str:
        """Código del certificado QR (lo escanea el consumidor)."""
        return "BT-" + uuid.uuid4().hex[:10].upper()

    def material_lote(self, lote: Lote) -> str:
        """Serialización canónica y determinista del lote para el hash."""
        historial = [
            {
                "id": str(e.id),
                "tipo": e.tipo.value,
                "de": e.de_estado.value if e.de_estado else None,
                "a": e.a_estado.value,
                "actor": str(e.actor_id),
                "peso": e.peso_kg,
                "merma": e.merma_pct,
                "registrado_en": e.registrado_en.isoformat(),
            }
            for e in sorted(lote.historial, key=lambda e: e.registrado_en)
        ]
        payload = {
            "lote_id": str(lote.id),
            "finca_id": str(lote.finca_id),
            "codigo_publico": lote.codigo_publico,
            "fecha_cosecha": lote.fecha_cosecha.isoformat(),
            "peso_actual_kg": lote.peso_actual_kg,
            "estado": lote.estado.value,
            "historial": historial,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    def hash_lote(self, lote: Lote) -> str:
        return hashlib.sha256(self.material_lote(lote).encode("utf-8")).hexdigest()

    def crear_certificado(self, lote: Lote) -> CertificadoQR:
        return CertificadoQR(
            id=uuid.uuid4(),
            lote_id=lote.id,
            codigo=self.generar_codigo_certificado(),
            hash_sha256=self.hash_lote(lote),
        )
