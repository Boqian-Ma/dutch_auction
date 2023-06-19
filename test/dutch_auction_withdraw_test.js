const DutchAuction = artifacts.require("DutchAuction");
const WbtcContract = artifacts.require("Wbtc");
const truffleAssert = require("truffle-assertions");

const BN = require("bn.js");

contract("DutchAuction: withdrawToken", (accounts) => {
    let dutchAuction;
    let WBTCToken;
    // const deposit_amount = 100;

    const owner = accounts[0];
    const wallet1 = accounts[1];
    // const wallet2 = accounts[2];

    const WBTC = web3.utils.asciiToHex("WBTC"); // change to bytes32
    const WETH = web3.utils.asciiToHex("WETH"); // change to bytes32

    before(async () => {
        dutchAuction = await DutchAuction.new();
        WBTCToken = await WbtcContract.new({
            from: owner,
        });
        // add wbtc to whitelist
        await dutchAuction.addToken(WBTC, WBTCToken.address);

        // Transfer some tokens to the depositor's address
        const result = await WBTCToken.transfer(wallet1, 500);
        assert(result);

        // Deposit 100 WBTC
        await WBTCToken.approve(dutchAuction.address, 100, {
            from: wallet1,
        });
        await dutchAuction.depositTokens(100, WBTC, {
            from: wallet1,
        });

        // set global state
        dutchAuction.godModeSetStage(0, { from: owner });
    });

    it("check initial user contract balance", async () => {
        const wbtc_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );

        assert(wbtc_balance.liquid == 100, "Wallet 1 should have 100 WBTC");
    });

    it("should withdraw WBTC", async () => {
        // Arrange
        const initial_auction_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        const initial_auction_liquid_balance = new BN(
            initial_auction_balance.liquid
        );

        const initial_wbtc_balance = new BN(await WBTCToken.balanceOf(wallet1));

        const withdraw_amount = 50;

        // Act
        await dutchAuction.withdrawTokens(withdraw_amount, WBTC, {
            from: wallet1,
        });

        // Assert
        // should have 50 left in contract
        var after_auction_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        after_auction_liquid_balance = new BN(after_auction_balance.liquid);

        // console.log(typeof after_auction_balance.liquid);

        const auction_liquid_balance_difference =
            initial_auction_liquid_balance.sub(after_auction_liquid_balance);
        assert.equal(
            withdraw_amount.toString(),
            auction_liquid_balance_difference.toString()
        );

        // // should have 50 more in token contract
        const after_wbtc_balance = new BN(await WBTCToken.balanceOf(wallet1));
        const wbtc_difference = after_wbtc_balance.sub(initial_wbtc_balance);
        assert.equal(withdraw_amount.toString(), wbtc_difference.toString());
    });

    it("should not withdraw due to insufficient balance", async () => {
        // Set up
        const insufficient_amount = 1000;
        const og_contract_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        const og_liquid_balance = new BN(og_contract_balance.liquid);
        const og_wbtc_balance = new BN(await WBTCToken.balanceOf(wallet1));

        await truffleAssert.reverts(
            dutchAuction.withdrawTokens(insufficient_amount, WBTC, {
                from: wallet1,
            }),
            "Insufficient liquid balance"
        );

        // Assert
        const new_contract_balance = await dutchAuction.getAccountBalance(
            wallet1,
            WBTC
        );
        const new_liquid_balance = new BN(new_contract_balance.liquid);

        assert(
            og_liquid_balance.toString() == new_liquid_balance.toString(),
            "contract balance should not change"
        );

        const new_wbtc_balance = new BN(await WBTCToken.balanceOf(wallet1));
        assert(
            og_wbtc_balance.toString() == new_wbtc_balance.toString(),
            "wbtc balance should not change"
        );
    });

    it("should not withdraw tokens that do not exist", async () => {
        // With draw WETH, which is not whitelisted
        await truffleAssert.reverts(
            dutchAuction.withdrawTokens(1, WETH, {
                from: wallet1,
            }),
            "Token is not in whitelist"
        );
    });
});
