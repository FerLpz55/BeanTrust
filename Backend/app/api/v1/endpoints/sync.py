"""Sincronización offline batch (§7.5). 202 si todo ok, 207 si hay conflictos."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.dependencies import CurrentUserDep, LoteServiceDep, require_rol
from app.models.dominio import (
    ErrorDeDominio,
    EventoDuplicado,
    LoteNoEncontrado,
    Rol,
    TransicionInvalida,
)
from app.schemas.lote import LoteCreate
from app.schemas.sync import (
    SyncOperacion,
    SyncRegistroCosechaOp,
    SyncRequest,
    SyncResponse,
    SyncResultado,
)

router = APIRouter(
    prefix="/sync",
    tags=["sync"],
    dependencies=[Depends(require_rol(Rol.PRODUCTOR, Rol.COOPERATIVA, Rol.ADMIN))],
)


def _procesar(op: SyncOperacion, usuario: CurrentUserDep, servicio: LoteServiceDep) -> None:
    if op.tipo == "registrar_cosecha":
        cosecha: SyncRegistroCosechaOp = op
        servicio.registrar_cosecha(
            LoteCreate(
                id=cosecha.id,
                finca_id=cosecha.finca_id,
                fecha_cosecha=cosecha.fecha_cosecha,
                peso_kg=cosecha.peso_kg,
                variedad=cosecha.variedad,
                metodo_beneficiado=cosecha.metodo_beneficiado,
                evidencia_id=cosecha.evidencia_id,
            ),
            usuario,
        )
    else:
        servicio.avanzar_estado(usuario, op.lote_id, op.evento, op.id)


@router.post("")
def sincronizar(
    body: SyncRequest,
    response: Response,
    usuario: CurrentUserDep,
    servicio: LoteServiceDep,
) -> SyncResponse:
    resultados: list[SyncResultado] = []
    todo_ok = True
    for op in body.operaciones:
        try:
            _procesar(op, usuario, servicio)
            resultados.append(SyncResultado(id=op.id, estado="ok"))
        except (LoteNoEncontrado, TransicionInvalida, EventoDuplicado) as exc:
            todo_ok = False
            resultados.append(SyncResultado(id=op.id, estado="conflicto", detalle=exc.mensaje))
        except ErrorDeDominio as exc:
            todo_ok = False
            resultados.append(SyncResultado(id=op.id, estado="error", detalle=exc.mensaje))
        except Exception:
            todo_ok = False
            resultados.append(SyncResultado(id=op.id, estado="error", detalle="Error interno."))
    response.status_code = 202 if todo_ok else 207
    return SyncResponse(resultados=resultados)
