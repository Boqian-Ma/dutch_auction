const DutchAuction = artifacts.require("DutchAuction");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const WbtcContract = artifacts.require("./WBTC.sol");

// const DutchAuction = artifacts.require("DutchAuction");

contract("StateMachine: Simple time based tests", (accounts) => {
    let owner, wallet1, wallet2;

    let dutchAuction;
    let WBTCToken;
    owner = accounts[0];

    const bid_unit_price_eth = 10;
    const bid_quantity = 10;

    const WBTC = web3.utils.asciiToHex("WBTC"); // change to bytes32

    beforeEach(async () => {
        let snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot["result"];

        await web3.eth.accounts.wallet.create(2);
        wallet1 = web3.eth.accounts.wallet[0];
        wallet2 = web3.eth.accounts.wallet[1];

        /** Bind the new wallet to the personal accounts */
        await web3.eth.personal.importRawKey(wallet1.privateKey, ""); // password is empty
        await web3.eth.personal.unlockAccount(wallet1.address, "", 10000); // arbitrary duration

        await web3.eth.personal.importRawKey(wallet2.privateKey, ""); // password is empty
        await web3.eth.personal.unlockAccount(wallet2.address, "", 10000); // arbitrary duration

        // create contract
        dutchAuction = await DutchAuction.new();
        WBTCToken = await WbtcContract.new({
            from: owner,
        });

        // update accounts
        accounts = await web3.eth.getAccounts();

        // load account 1
        await web3.eth.sendTransaction({
            to: wallet1.address,
            from: accounts[8],
            value: web3.utils.toWei("1"),
        });

        // load account 2
        await web3.eth.sendTransaction({
            to: wallet2.address,
            from: accounts[7],
            value: web3.utils.toWei("1"),
        });

        // add wbtc to whitelist
        await dutchAuction.addToken(WBTC, WBTCToken.address);

        // Transfer some tokens to the depositor's address
        var result = await WBTCToken.transfer(wallet1.address, 500);

        assert(result);

        // Deposit 100 WBTC
        await WBTCToken.approve(dutchAuction.address, 100, {
            from: wallet1.address,
        });
        await dutchAuction.depositTokens(100, WBTC, {
            from: wallet1.address,
        });

        // Deposit 100 WETH

        // Deposit some ethers
        const tx = await dutchAuction.depositETH({
            from: wallet1.address,
            value: 1000,
        });
    });

    afterEach(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    /* ADD TESTS HERE */
    describe("Stage tests: Deposit and Withdraw", () => {
        beforeEach(async () => {
            // Set up accounts and whitelist tokens
            // at the start the state should be deposit
        });
        // xit("Should succeed: deposit tokens", async () => {
        // });
        // xit("Should succeed: withdraw tokens", async () => {});
        // xit("Should succeed: deposit eth", async () => {});
        // xit("Should succeed: withdraw eth", async () => {});

        it("Should fail: perform bidding operations out of turn", async () => {
            const bid_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid_quantity, bid_unit_price_eth]
            );
            const bid_hash = web3.utils.keccak256(bid_encoded);

            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );

            await truffleAssert.reverts(
                dutchAuction.createBid(signature.signature, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });

        it("Should fail: perform offer operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.createOffer(WBTC, 1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });

        it("Should fail: perform matching operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.matchOffers({
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
    });

    describe("Stage tests: Offer", () => {
        beforeEach(async () => {
            // fast forward time
            // Fast forward to offer
            await timeMachine.advanceTimeAndBlock(300);
        });

        it("Should fail: perform deposit and withdraw operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.withdrawETH(web3.utils.toWei("10"), {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });

        it("Should fail: perform bidding operations out of turn", async () => {
            const bid_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid_quantity, bid_unit_price_eth]
            );
            const bid_hash = web3.utils.keccak256(bid_encoded);

            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );

            await truffleAssert.reverts(
                dutchAuction.createBid(signature.signature, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
        it("Should fail: perform matching operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.matchOffers({
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
    });

    describe("Stage tests: Bid opening", () => {
        beforeEach(async () => {
            // fast forward time
            // Fast forward to offer
            await timeMachine.advanceTimeAndBlock(300);
            await dutchAuction.probeStage();
            await timeMachine.advanceTimeAndBlock(300);
            await dutchAuction.probeStage();
            var curr_stage = await dutchAuction.stage();
            assert.equal(curr_stage.toString(), "2");
        });

        it("Should fail: perform deposit and withdraw operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.depositETH({
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.withdrawETH(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.depositTokens(1, WBTC, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.withdrawTokens(1, WBTC, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
        it("Should fail: perform offer operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.createOffer(WBTC, 1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
        it("Should fail: perform matching operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.matchOffers({
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
    });

    describe("Stage tests: Matching", () => {
        beforeEach(async () => {
            // Set up accounts and whitelist tokens

            await timeMachine.advanceTimeAndBlock(300);
            await dutchAuction.probeStage();
            await timeMachine.advanceTimeAndBlock(300);
            await dutchAuction.probeStage();
            await timeMachine.advanceTimeAndBlock(300);
            await dutchAuction.probeStage();
            var curr_stage = await dutchAuction.stage();
            assert.equal(curr_stage.toString(), "3");
        });
        it("Should succeed: Matching and state change right after", async () => {
            await dutchAuction.matchOffers();
            var curr_stage = await dutchAuction.stage();
            assert.equal(curr_stage.toString(), "0");
        });
        it("Should fail: perform deposit and withdraw operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.depositETH({
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.withdrawETH(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.depositTokens(1, WBTC, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.withdrawTokens(1, WBTC, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
        it("Should fail: perform offer operations out of turn", async () => {
            await truffleAssert.reverts(
                dutchAuction.createOffer(WBTC, 1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateOffer(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(1, 1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
        it("Should fail: perform Bid operations out of turn", async () => {
            const bid_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid_quantity, bid_unit_price_eth]
            );
            const bid_hash = web3.utils.keccak256(bid_encoded);

            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );

            await truffleAssert.reverts(
                dutchAuction.createBid(signature.signature, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "This operation is not allowed to be performed at this stage"
            );

            await truffleAssert.reverts(
                dutchAuction.withdrawBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
            await truffleAssert.reverts(
                dutchAuction.reactivateBid(1, {
                    from: wallet1.address,
                }),
                "This operation is not allowed to be performed at this stage"
            );
        });
    });
});
