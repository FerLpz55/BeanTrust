// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CoffeeTraceability
/// @notice Ancla inmutablemente la raíz SHA-256 del Pasaporte de Café de un lote.
/// @dev Contrato no actualizable y sin recepción de ETH. No conoce pagos, ERC-20
/// ni estados del café: su única responsabilidad es dejar constancia on-chain de
/// (loteId, hashRaiz, actor, timestamp) con un anclaje por lote.
///
/// Conversión canónica usada por el backend (probada en ambos lados):
/// - UUID de `lotes.id` -> 16 bytes hexadecimales rellenados a la derecha hasta `bytes32`.
/// - `qr_certificado.hash_sha256` -> sus 64 caracteres hexadecimales como `bytes32`.
/// No se aplica `keccak256`: el hash ya es SHA-256 canónico del Pasaporte.
contract CoffeeTraceability is AccessControlDefaultAdminRules, Pausable {
    /// @notice Rol autorizado a anclar (wallet caliente del backend).
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");
    /// @notice Rol autorizado a pausar/despausar el anclaje (freno de emergencia).
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    /// @notice Retardo de las operaciones administrativas (transferencia de admin).
    uint48 public constant ADMIN_DELAY = 48 hours;

    /// @notice Estado inmutable de un lote anclado.
    struct Anchor {
        bytes32 hashRaiz;
        address actor;
        uint256 anchoredAt;
    }

    mapping(bytes32 loteId => Anchor) private _anchors;
    mapping(bytes32 loteId => bool) private _anchored;

    error DireccionInvalida();
    error LoteIdInvalido();
    error HashRaizInvalido();
    error LoteYaAnclado(bytes32 loteId);
    error AnchorNoEncontrado(bytes32 loteId);

    event HashAnchored(
        bytes32 indexed loteId, bytes32 indexed hashRaiz, address indexed actor, uint256 anchoredAt
    );

    /// @param admin  Dirección con `DEFAULT_ADMIN_ROLE` (cuenta de despliegue).
    /// @param pauser Dirección con `PAUSER_ROLE` (freno de emergencia).
    /// @param anchor Dirección con `ANCHOR_ROLE` (wallet del backend).
    constructor(address admin, address pauser, address anchor)
        AccessControlDefaultAdminRules(ADMIN_DELAY, admin)
    {
        if (pauser == address(0)) revert DireccionInvalida();
        if (anchor == address(0)) revert DireccionInvalida();
        _grantRole(PAUSER_ROLE, pauser);
        _grantRole(ANCHOR_ROLE, anchor);
    }

    /// @notice Ancla la raíz SHA-256 del Pasaporte de un lote. Un solo anclaje por lote.
    /// @dev Requiere `ANCHOR_ROLE`, rechaza `bytes32(0)` y respeta la pausa.
    function anchorHash(bytes32 loteId, bytes32 hashRaiz)
        external
        onlyRole(ANCHOR_ROLE)
        whenNotPaused
    {
        if (loteId == bytes32(0)) revert LoteIdInvalido();
        if (hashRaiz == bytes32(0)) revert HashRaizInvalido();
        if (_anchored[loteId]) revert LoteYaAnclado(loteId);

        _anchored[loteId] = true;
        _anchors[loteId] =
            Anchor({ hashRaiz: hashRaiz, actor: msg.sender, anchoredAt: block.timestamp });

        emit HashAnchored(loteId, hashRaiz, msg.sender, block.timestamp);
    }

    /// @notice ¿El lote ya tiene una raíz anclada?
    function isAnchored(bytes32 loteId) external view returns (bool) {
        return _anchored[loteId];
    }

    /// @notice Devuelve la raíz, el actor y el timestamp del anclaje de un lote.
    /// @dev Revierte si el lote no está anclado (evita ambigüedad con el valor cero).
    function getAnchor(bytes32 loteId)
        external
        view
        returns (bytes32 hashRaiz, address actor, uint256 anchoredAt)
    {
        if (!_anchored[loteId]) revert AnchorNoEncontrado(loteId);
        Anchor storage a = _anchors[loteId];
        return (a.hashRaiz, a.actor, a.anchoredAt);
    }

    /// @notice Pausa el anclaje (freno de emergencia).
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Reanuda el anclaje.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
