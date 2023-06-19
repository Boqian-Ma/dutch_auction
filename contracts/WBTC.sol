// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WBTC is ERC20 {
    constructor() ERC20("WBTC", "Wrap BTC") {
        _mint(msg.sender, 5000);
    }
}
