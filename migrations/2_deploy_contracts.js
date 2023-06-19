var DutchAuction = artifacts.require("./DutchAuction.sol");
var WBTC = artifacts.require("./WBTC.sol");
var WETH = artifacts.require("./WETH.sol");

module.exports = function (deployer) {
    deployer.deploy(WBTC);
    deployer.deploy(WETH);
    deployer.deploy(DutchAuction);
};
