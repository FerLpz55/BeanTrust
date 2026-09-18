// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import {
    IAccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/IAccessControlDefaultAdminRules.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

import { CoffeeTraceability } from "../src/CoffeeTraceability.sol";

contract CoffeeTraceabilityTest is Test {
    CoffeeTraceability internal c;

    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal anchor = makeAddr("anchor");
    address internal outsider = makeAddr("outsider");

    bytes32 internal constant LOTE_A = bytes32(uint256(0xA11CE));
    bytes32 internal constant HASH_A = bytes32(uint256(0xBEEF));
    bytes32 internal constant LOTE_B = bytes32(uint256(0xCAFE));
    bytes32 internal constant HASH_B = bytes32(uint256(0xF00D));

    function setUp() public {
        c = new CoffeeTraceability(admin, pauser, anchor);
    }

    // --------------------------------------------------------------- roles

    function test_Constructor_AsignaRolesYRetardo() public view {
        assertTrue(c.hasRole(c.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(c.hasRole(c.PAUSER_ROLE(), pauser));
        assertTrue(c.hasRole(c.ANCHOR_ROLE(), anchor));
        assertFalse(c.hasRole(c.ANCHOR_ROLE(), admin));
        assertEq(c.defaultAdminDelay(), 48 hours);
        assertEq(c.owner(), admin);
    }

    function test_Constructor_RevierteConDireccionesCero() public {
        vm.expectRevert(CoffeeTraceability.DireccionInvalida.selector);
        new CoffeeTraceability(admin, address(0), anchor);

        vm.expectRevert(CoffeeTraceability.DireccionInvalida.selector);
        new CoffeeTraceability(admin, pauser, address(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlInvalidDefaultAdmin.selector,
                address(0)
            )
        );
        new CoffeeTraceability(address(0), pauser, anchor);
    }

    function test_AdminPuedeOtorgarAnchorRole() public {
        bytes32 anchorRole = c.ANCHOR_ROLE();
        vm.prank(admin);
        c.grantRole(anchorRole, outsider);
        assertTrue(c.hasRole(anchorRole, outsider));
    }

    // ----------------------------------------------- transferencia retrasada

    function test_TransferenciaAdmin_RespetaRetardo() public {
        address newAdmin = makeAddr("newAdmin");
        uint48 delay = c.defaultAdminDelay();

        vm.prank(admin);
        c.beginDefaultAdminTransfer(newAdmin);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector,
                uint48(block.timestamp) + delay
            )
        );
        vm.prank(newAdmin);
        c.acceptDefaultAdminTransfer();

        vm.warp(block.timestamp + delay + 1);
        vm.prank(newAdmin);
        c.acceptDefaultAdminTransfer();

        assertTrue(c.hasRole(c.DEFAULT_ADMIN_ROLE(), newAdmin));
        assertFalse(c.hasRole(c.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_SoloAdminPuedeIniciarTransferencia() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                outsider,
                c.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(outsider);
        c.beginDefaultAdminTransfer(outsider);
    }

    // -------------------------------------------------------------- anclaje

    function test_AnchorHash_GuardaEstadoYEmiteEvento() public {
        vm.expectEmit(true, true, true, true, address(c));
        emit CoffeeTraceability.HashAnchored(LOTE_A, HASH_A, anchor, block.timestamp);

        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_A);

        assertTrue(c.isAnchored(LOTE_A));
        (bytes32 hashRaiz, address actor, uint256 anchoredAt) = c.getAnchor(LOTE_A);
        assertEq(hashRaiz, HASH_A);
        assertEq(actor, anchor);
        assertEq(anchoredAt, block.timestamp);
    }

    function test_AnchorHash_SoloAnchorRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, c.ANCHOR_ROLE()
            )
        );
        vm.prank(outsider);
        c.anchorHash(LOTE_A, HASH_A);
    }

    function test_AnchorHash_RechazaLoteCero() public {
        vm.expectRevert(CoffeeTraceability.LoteIdInvalido.selector);
        vm.prank(anchor);
        c.anchorHash(bytes32(0), HASH_A);
    }

    function test_AnchorHash_RechazaHashCero() public {
        vm.expectRevert(CoffeeTraceability.HashRaizInvalido.selector);
        vm.prank(anchor);
        c.anchorHash(LOTE_A, bytes32(0));
    }

    function test_AnchorHash_RechazaDuplicado() public {
        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_A);

        vm.expectRevert(abi.encodeWithSelector(CoffeeTraceability.LoteYaAnclado.selector, LOTE_A));
        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_B);

        (bytes32 hashRaiz,,) = c.getAnchor(LOTE_A);
        assertEq(hashRaiz, HASH_A, "el primer anclaje no debe cambiar");
    }

    function test_GetAnchor_RevierteSiNoAnclado() public {
        vm.expectRevert(
            abi.encodeWithSelector(CoffeeTraceability.AnchorNoEncontrado.selector, LOTE_A)
        );
        c.getAnchor(LOTE_A);
    }

    function test_IsAnchored_FalsoAntesDeAnclar() public view {
        assertFalse(c.isAnchored(LOTE_A));
    }

    // ----------------------------------------------------------------- pausa

    function test_Pause_DetieneAnclajeYUnpauseLoReanuda() public {
        vm.prank(pauser);
        c.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_A);

        vm.prank(pauser);
        c.unpause();

        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_A);
        assertTrue(c.isAnchored(LOTE_A));
    }

    function test_Pause_SoloPauserRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, anchor, c.PAUSER_ROLE()
            )
        );
        vm.prank(anchor);
        c.pause();

        vm.prank(pauser);
        c.pause();
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, outsider, c.PAUSER_ROLE()
            )
        );
        vm.prank(outsider);
        c.unpause();
    }

    // -------------------------------------------------------------- fuzzing

    function testFuzz_AnclaCualquierParNoCero(bytes32 loteId, bytes32 hashRaiz) public {
        vm.assume(loteId != bytes32(0));
        vm.assume(hashRaiz != bytes32(0));

        vm.prank(anchor);
        c.anchorHash(loteId, hashRaiz);

        assertTrue(c.isAnchored(loteId));
        (bytes32 stored, address actor, uint256 anchoredAt) = c.getAnchor(loteId);
        assertEq(stored, hashRaiz);
        assertEq(actor, anchor);
        assertEq(anchoredAt, block.timestamp);
    }

    // ------------------------------------------------------------- sin ETH

    function test_NoRecibeETH() public {
        vm.deal(outsider, 1 ether);
        vm.prank(outsider);
        (bool ok,) = address(c).call{ value: 1 ether }("");
        assertFalse(ok, "el contrato no debe aceptar ETH");
        assertEq(address(c).balance, 0);
    }

    function test_NoTieneFuncionesPayable() public {
        // El selector de cualquier funcion payable no existe: un envio con data
        // tampoco puede depositar ETH.
        vm.deal(outsider, 1 ether);
        vm.prank(outsider);
        (bool ok,) = address(c).call{ value: 1 ether }(
            abi.encodeWithSignature("anchorHash(bytes32,bytes32)", LOTE_A, HASH_A)
        );
        assertFalse(ok);
        assertEq(address(c).balance, 0);
    }

    // --------------------------------------------------------- ABI / interfaz

    function test_Abi_SelectoresCoincidenConElBackend() public pure {
        assertEq(
            CoffeeTraceability.anchorHash.selector, bytes4(keccak256("anchorHash(bytes32,bytes32)"))
        );
        assertEq(CoffeeTraceability.isAnchored.selector, bytes4(keccak256("isAnchored(bytes32)")));
        assertEq(CoffeeTraceability.getAnchor.selector, bytes4(keccak256("getAnchor(bytes32)")));
        assertEq(CoffeeTraceability.pause.selector, bytes4(keccak256("pause()")));
        assertEq(CoffeeTraceability.unpause.selector, bytes4(keccak256("unpause()")));
    }

    function test_Abi_EventoTopic() public pure {
        assertEq(
            CoffeeTraceability.HashAnchored.selector,
            keccak256("HashAnchored(bytes32,bytes32,address,uint256)")
        );
    }

    function test_Roles_RevocacionAnchorBloqueaAnclaje() public {
        bytes32 rol = c.ANCHOR_ROLE();
        vm.prank(admin);
        c.revokeRole(rol, anchor);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, anchor, rol
            )
        );
        vm.prank(anchor);
        c.anchorHash(LOTE_A, HASH_A);
    }

    function test_Roles_RevocacionPauserBloqueaPausa() public {
        bytes32 rol = c.PAUSER_ROLE();
        vm.prank(admin);
        c.revokeRole(rol, pauser);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, rol
            )
        );
        vm.prank(pauser);
        c.pause();
    }
}
