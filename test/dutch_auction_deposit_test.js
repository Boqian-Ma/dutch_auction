const DutchAuction = artifacts.require("./DutchAuction.sol");
const WbtcContract = artifacts.require("./WBTC.sol");
const WethContract = artifacts.require("./WETH.sol");

const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

const Web3 = require("web3");
const web3 = new Web3(DutchAuction.web3.currentProvider);

contract("DuctchAuction: depositTokens", (accounts) => {
    let dutchAuction;
    let WBTCToken;
    const deposit_amount = 100;

    const owner = accounts[0];
    const wallet1 = accounts[1];
    // const wallet2 = accounts[2];

    const WBTC = web3.utils.asciiToHex("WBTC"); // change to bytes32
    const WETH = web3.utils.asciiToHex("WETH"); // change to bytes32

    beforeEach(async () => {
        // Deploy the contract instances
        // console.log("fuck");
        dutchAuction = await DutchAuction.new();
        WBTCToken = await WbtcContract.new({
            from: owner,
        });

        // add wbtc to whitelist
        await dutchAuction.addToken(WBTC, WBTCToken.address);
        // Transfer some tokens to the depositor's address
        var result = await WBTCToken.transfer(wallet1, 500);
        assert(result);

        // set mode to deposit
        dutchAuction.godModeSetStage(0, { from: owner });
    });

    it("wallet 1 should have 500 tokens", async () => {
        const balance = await WBTCToken.balanceOf(wallet1);
        assert(balance == 500, "balance should be 500");
    });

    it("should deposit ERC20 tokens", async () => {
        await WBTCToken.approve(dutchAuction.address, deposit_amount, {
            from: wallet1,
        });

        // // Deposit tokens to contract
        await dutchAuction.depositTokens(deposit_amount, WBTC, {
            from: wallet1,
        });

        // Check the depositor's account balance
        const depositor_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        assert.equal(
            depositor_balance.liquid.toString(),
            deposit_amount.toString()
        );
    });

    it("should not deposit ERC20 tokens if the depositor has insufficient balance", async () => {
        // Approve the token transfer
        const insufficient_amount = 1000;

        await WBTCToken.approve(dutchAuction.address, insufficient_amount, {
            from: wallet1,
        });

        // Try to deposit more tokens than the depositor has
        await truffleAssert.reverts(
            dutchAuction.depositTokens(insufficient_amount, WBTC, {
                from: wallet1,
            }),
            "Insufficient balance"
        );

        // Check that the depositor's account balance hasn't changed
        const depositor_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        assert.equal(depositor_balance.liquid.toString(), "0");
    });

    it("should not deposit non-whitelisted ERC20 tokens", async () => {
        // Deploy another ERC20 token that is not whitelisted

        WETHToken = await WbtcContract.new({
            from: owner,
        });

        result = await WETHToken.transfer(wallet1, 500);
        assert(result);

        const balance = await WETHToken.balanceOf(wallet1);
        assert.equal(balance, 500);

        // Approve the token transfer
        await WETHToken.approve(dutchAuction.address, deposit_amount, {
            from: wallet1,
        });

        // Try to deposit the non-whitelisted tokens
        await truffleAssert.reverts(
            dutchAuction.depositTokens(deposit_amount, WETH, {
                from: wallet1,
            }),
            "Token is not in whitelist"
        );
    });

    it("Should succeed: Wallet1 deposit 1 wei", async () => {
        // get before eth contract balance
        const value = web3.utils.toWei("1");
        var contract_balance = await dutchAuction.ethBalances(wallet1);
        var liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), "0");
        // deposit
        const tx = await dutchAuction.depositETH({
            from: wallet1,
            value,
        });

        // get after eth contract
        var contract_balance = await dutchAuction.ethBalances(wallet1);
        liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), value.toString());
    });

    it("Should succeed: Wallet1 withdraw 1 wei", async () => {
        const deposit_amount = web3.utils.toWei("10");
        var contract_balance = await dutchAuction.ethBalances(wallet1);
        var liquid_balance = contract_balance.liquid;

        const initialUserBalance = await web3.eth.getBalance(wallet1);

        assert.equal(liquid_balance.toString(), "0");
        // deposit
        const tx = await dutchAuction.depositETH({
            from: wallet1,
            value: deposit_amount,
        });

        contract_balance = await dutchAuction.ethBalances(wallet1);
        liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), deposit_amount.toString());

        await dutchAuction.withdrawETH(deposit_amount, {
            from: wallet1,
        });

        // get after eth contract
        contract_balance = await dutchAuction.ethBalances(wallet1);
        liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), "0");
    });

    it("Should fail: Wallet1 over withdraw", async () => {
        const value = web3.utils.toWei("1");
        var contract_balance = await dutchAuction.ethBalances(wallet1);
        var liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), "0");
        // deposit
        const tx = await dutchAuction.depositETH({
            from: wallet1,
            value,
        });

        contract_balance = await dutchAuction.ethBalances(wallet1);
        liquid_balance = contract_balance.liquid;

        assert.equal(liquid_balance.toString(), value.toString());

        await truffleAssert.reverts(
            dutchAuction.withdrawETH(web3.utils.toWei("10"), {
                from: wallet1,
            }),
            "Insufficient balance"
        );

        // get after eth contract
        contract_balance = await dutchAuction.ethBalances(wallet1);
        var liquid_balance = contract_balance.liquid;
        assert.equal(liquid_balance.toString(), value.toString());
    });
});
