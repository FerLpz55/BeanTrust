---
workflow: general-video
flow: automation
storyboard: no
message: "BeanTrust registra cada etapa del café con hash inmutable y paga justo (97/3) sin coyotaje — el productor lo controla, el comprador lo verifica escaneando un QR."
destination: showcase / demo interno
aspect: portrait (1080x1920)
length: 35-45s
audience: stakeholders / demo del proyecto (no público general)
---

## Intent

Video demo tipo product-tour de BeanTrust (app móvil de trazabilidad y comercio
justo del café), construido a partir de capturas de pantalla reales tomadas
durante pruebas end-to-end contra la app real (React Native Web, no mockups).
No hay grabación de video de la app — el material fuente son 10 PNG en
`assets/screens/`, en el orden de la historia:

1. `01-dashboard.png` — Dashboard "Mi Finca" del productor.
2. `02-wizard.png` — Wizard de nueva cosecha (variedad + método).
3. `03-lote-creado.png` — Lote recién creado en el dashboard.
4. `04-detalle-cereza.png` — Detalle del lote en CEREZA, listo para trazabilidad.
5. `05-progreso.png` — Timeline avanzando (evento tras evento, guiado).
6. `06-certificado-qr.png` — TOSTADO: timeline con hash por etapa + QR del pasaporte.
7. `07-venta-txhash.png` — Cooperativa registra la venta: tx_hash simulado, 97/3.
8. `08-comprador-escanea.png` — Comprador: "Escanea para ver el comercio justo".
9. `09-pasaporte-publico.png` — Certificado de Origen público con QR + comercio justo.
10. `10-propina.png` — Propina directa al productor confirmada.

Narrativa (guion en 5 beats):
1. Problema (texto solo, sin captura): el coyotaje se queda con hasta el 70% del café.
2. Productor registra su cosecha y la app le sugiere cada siguiente paso — no tiene que pensarlo.
3. Al llegar a tostado se emite un certificado con QR, hash inmutable por etapa.
4. La cooperativa vende — pago 97/3 simulado (sin blockchain real, es un MVP de demo — no ocultarlo pero tampoco es el foco).
5. El comprador escanea el QR, ve el origen certificado, y deja una propina 100% directa al productor.

## Design

Paleta "Copa de cata" de BeanTrust: espresso `#3A1D0C` (fondo/acentos fuertes),
crema `#8A5A00` (CTA/acentos), cereza `#8A2E3D` (alertas/destino), superficie
`#F7EBDD` (fondos claros). Tipografía: serif para títulos (estilo Fraunces/Playfair,
como en las capturas), sans-serif para cuerpo.

Tratamiento: cada captura vive dentro de un marco de teléfono (rounded card,
sombra suave) sobre fondo de marca — no full-bleed (las capturas son 430x932,
estirarlas a pantalla completa se ve borroso). Ken Burns sutil dentro de cada
card para dar vida sin exagerar. Transiciones simples (crossfade/slide), nada
de shaders vistosos — es un demo de producto serio, no un anuncio.

## Customizations

- Sin voice-over ni música con derechos — usar `/media-use` para una pista de
  fondo instrumental libre de regalías, suave, tipo "coffee shop acoustic",
  o silencio si no se encuentra algo apropiado rápido.
- Captions en español (el mismo idioma que la app).
- Cerrar con card de marca: nombre + una línea (p.ej. "Trazabilidad real. Pago justo. Sin intermediarios.").

## Assets

Ver `assets/screens/` (10 PNG, listados arriba en orden).

## Notes

Dinero y "blockchain" son simulados a propósito (MVP de demo, documentado en
el propio proyecto) — no representar la app como si moviera dinero real.
