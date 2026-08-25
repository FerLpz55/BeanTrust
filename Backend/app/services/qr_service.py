"""Servicio del Pasaporte de Café (QR, §8).

El backend solo persiste `codigo` + `hash_sha256` (raíz de la cadena por
etapa); la imagen del QR la renderiza el cliente. El hash permite detectar
manipulación del historial. La integridad se corta por `emitido_en`: los
eventos posteriores a la emisión del certificado NO forman parte del hash
canónico verificado (ADR-11, ADR-13).
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

    def material_lote(self, lote: Lote, hasta_emitido_en: bool = True) -> str:
        """Serialización canónica y determinista del lote para el hash.

        Si `hasta_emitido_en` es True, solo incluye eventos con
        `registrado_en <= emitido_en` del certificado (corte de integridad).
        """
        certificado = lote.certificado
        corte = certificado.emitido_en if (hasta_emitido_en and certificado) else None

        eventos_al_corte = [
            e
            for e in sorted(lote.historial, key=lambda e: e.registrado_en)
            if corte is None or e.registrado_en <= corte
        ]
        historial = [
            {
                "id": str(e.id),
                "tipo": e.tipo.value,
                "de": e.de_estado.value if e.de_estado else None,
                "a": e.a_estado.value,
                "actor": str(e.actor_id),
                "peso": e.peso_kg,
                "merma": e.merma_pct,
                "metodo_beneficiado": e.metodo_beneficiado,
                "metodo_fermentacion": e.metodo_fermentacion,
                "fermentacion_horas": e.fermentacion_horas,
                "humedad_inicial_pct": e.humedad_inicial_pct,
                "humedad_final_pct": e.humedad_final_pct,
                "metodo_secado": e.metodo_secado,
                "dias_reposo": e.dias_reposo,
                "puntaje_sca": e.puntaje_sca,
                "defectos": e.defectos,
                "densidad": e.densidad,
                "tamiz": e.tamiz,
                "registrado_en": e.registrado_en.isoformat(),
                "hash_etapa": e.hash_etapa,
            }
            for e in eventos_al_corte
        ]
        # `estado`/`peso_actual_kg` son campos denormalizados en `lote`: solo
        # reflejan el presente. Si se usan tal cual con `hasta_emitido_en`,
        # cualquier evento posterior a la emisión (p.ej. VENTA) cambia el
        # hash recalculado y el certificado deja de verificar (regresión
        # real: se detectó al vender un lote ya con Pasaporte de Café).
        # Se reconstruyen "como estaban" al corte, a partir del propio
        # historial filtrado, igual que `Lote.avanzar` los fue mutando.
        if corte is not None and eventos_al_corte:
            estado_al_corte = eventos_al_corte[-1].a_estado.value
            peso_al_corte = next(
                (e.peso_kg for e in reversed(eventos_al_corte) if e.peso_kg is not None),
                lote.peso_actual_kg,
            )
        else:
            estado_al_corte = lote.estado.value
            peso_al_corte = lote.peso_actual_kg

        payload = {
            "lote_id": str(lote.id),
            "finca_id": str(lote.finca_id),
            "codigo_publico": lote.codigo_publico,
            "fecha_cosecha": lote.fecha_cosecha.isoformat(),
            "peso_actual_kg": peso_al_corte,
            "estado": estado_al_corte,
            "variedad": lote.variedad,
            "metodo_beneficiado": lote.metodo_beneficiado,
            "evidencia_url": lote.evidencia_url,
            "evidencia_sha256": lote.evidencia_sha256,
            "historial": historial,
        }
        return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    def hash_lote(self, lote: Lote, hasta_emitido_en: bool = True) -> str:
        return hashlib.sha256(
            self.material_lote(lote, hasta_emitido_en).encode("utf-8")
        ).hexdigest()

    def crear_certificado(self, lote: Lote) -> CertificadoQR:
        return CertificadoQR(
            id=uuid.uuid4(),
            lote_id=lote.id,
            codigo=self.generar_codigo_certificado(),
            hash_sha256=self.hash_lote(lote, hasta_emitido_en=True),
        )
