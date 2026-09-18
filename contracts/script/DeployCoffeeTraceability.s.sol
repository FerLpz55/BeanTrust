// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script, console2 } from "forge-std/Script.sol";

import { CoffeeTraceability } from "../src/CoffeeTraceability.sol";

/// @notice Despliega `CoffeeTraceability` en la red configurada por el CLI.
/// @dev Uso:
///   forge script script/DeployCoffeeTraceability.s.sol \
///     --rpc-url "$BASE_SEPOLIA_RPC_URL" --account beanst-admin --broadcast
///   Las direcciones se leen del entorno (nunca la private key): el firmante lo
///   aporta `cast wallet import` / `--account`.
contract DeployCoffeeTraceability is Script {
    function run() external returns (CoffeeTraceability deployed) {
        address admin = vm.envAddress("DEFAULT_ADMIN_ADDRESS");
        address pauser = vm.envAddress("PAUSER_ADDRESS");
        address anchor = vm.envAddress("BACKEND_ANCHOR_ADDRESS");

        require(admin != address(0), "DEFAULT_ADMIN_ADDRESS no puede ser cero");
        require(pauser != address(0), "PAUSER_ADDRESS no puede ser cero");
        require(anchor != address(0), "BACKEND_ANCHOR_ADDRESS no puede ser cero");

        vm.startBroadcast();
        deployed = new CoffeeTraceability(admin, pauser, anchor);
        vm.stopBroadcast();

        console2.log("CoffeeTraceability:", address(deployed));
        console2.log("chainid:", block.chainid);
        console2.log("DEFAULT_ADMIN_ADDRESS:", admin);
        console2.log("PAUSER_ADDRESS:", pauser);
        console2.log("BACKEND_ANCHOR_ADDRESS:", anchor);
    }
}
