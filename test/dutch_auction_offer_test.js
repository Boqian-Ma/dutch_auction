const DutchAuction = artifacts.require("DutchAuction");
const WbtcContract = artifacts.require("Wbtc");
const WethContract = artifacts.require("Weth");
const truffleAssert = require("truffle-assertions");
const BN = require("bn.js");

const null_address = "0x0000000000000000000000000000000000000000";

contract("DutchAuction: Offer", (accounts) => {
    let dutchAuction;
    let WBTCToken;
    let WETHToken;
    // const deposit_amount = 100;

    const owner = accounts[0];
    const wallet1 = accounts[1];
    const wallet2 = accounts[2];

    const WBTC = web3.utils.asciiToHex("WBTC"); // change to bytes32
    const WETH = web3.utils.asciiToHex("WETH"); // change to bytes32

    beforeEach(async () => {
        dutchAuction = await DutchAuction.new();
        WBTCToken = await WbtcContract.new({
            from: owner,
        });
        WETHToken = await WethContract.new({
            from: owner,
        });
        // add wbtc to whitelist
        await dutchAuction.addToken(WBTC, WBTCToken.address);

        // Transfer some tokens to the depositor's address
        var result = await WBTCToken.transfer(wallet1, 500);
        assert(result);

        result = await WBTCToken.transfer(wallet1, 500);
        assert(result);

        // Deposit 100 WBTC
        await WBTCToken.approve(dutchAuction.address, 100, {
            from: wallet1,
        });
        await dutchAuction.depositTokens(100, WBTC, {
            from: wallet1,
        });

        // god mode
        await dutchAuction.godModeSetStage(1, { from: owner });
    });
    describe("Create offers", async () => {
        it("should no offers", async () => {
            const offer_count = await dutchAuction.offer_count();
            assert.equal(offer_count, 0);
        });
        it("should succeed: create an offer", async () => {
            // Arrange

            // Get OG balance
            const old_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            const quantity = 10;
            const offer_unit_price_eth = 1;
            // Act
            await dutchAuction.createOffer(
                WBTC,
                quantity,
                offer_unit_price_eth,
                {
                    from: wallet1,
                }
            );
            // Assert
            // Get offerlist

            const offer = await dutchAuction.offers(0);

            // check offer attributes
            assert.equal(offer.id, 0);
            assert.equal(offer.created_by, wallet1);
            // assert.equal(offer.matched_by, null_address);
            assert.equal(web3.utils.hexToUtf8(offer.symbol), "WBTC");
            assert.equal(
                offer.quantity.toString(),
                new BN(quantity).toString()
            );
            assert.equal(
                offer.remaining_quantity.toString(),
                new BN(quantity).toString()
            );
            assert.equal(
                offer.offer_unit_price_eth.toString(),
                new BN(offer_unit_price_eth).toString()
            );
            assert(Date.now() > offer.creation_time);
            assert.equal(offer.status, 0); // 0 corresponds to active

            // offer count should increase
            assert(await dutchAuction.offer_count(), 1);
            // asset should be locked, 10 WBTC should be locked
            const new_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            // Liquid should decrease
            const liquid_diff = old_liquid.sub(new_liquid);
            const locked_diff = new_locked.sub(old_locked);
            assert(
                liquid_diff.toString() === quantity.toString(),
                "liquid amount should decrease"
            );
            assert(
                locked_diff.toString() === quantity.toString(),
                "locked amount should increase"
            );
        });

        it("Should fail: create offer with token not in whitelist", async () => {
            const quantity = 10;
            const offer_unit_price_eth = 1;
            // Act
            await truffleAssert.reverts(
                dutchAuction.createOffer(WETH, quantity, offer_unit_price_eth, {
                    from: wallet1,
                }),
                "Token is not in whitelist"
            );
        });

        it("should fail: insufficient balance to offer", async () => {
            const old_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            const quantity = 1000;
            const offer_unit_price_eth = 1;
            // Act
            await truffleAssert.reverts(
                dutchAuction.createOffer(WBTC, quantity, offer_unit_price_eth, {
                    from: wallet1,
                }),
                "Insufficient liquid balance"
            );

            // assert
            const new_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            assert(
                new_liquid.toString() === old_liquid.toString(),
                "Liquid balance should not change"
            );

            assert(
                new_locked.toString() === old_locked.toString(),
                "Locked balance should not change"
            );
        });
    });

    describe("Update offer", async () => {
        const offer_id = 0;
        const offer_unit_price_eth = 10;
        const quantity = 10;

        beforeEach(async () => {
            // Create offer
            await dutchAuction.createOffer(
                WBTC,
                quantity,
                offer_unit_price_eth,
                {
                    from: wallet1,
                }
            );
        });

        it("Should succeed: decrease offer price", async () => {
            const new_unit_price = 5;
            await dutchAuction.decreaseOfferPrice(offer_id, new_unit_price, {
                from: wallet1,
            });
            // assert new unit price
            const new_offer = await dutchAuction.offers(offer_id);
            assert.equal(new_offer.offer_unit_price_eth, new_unit_price);
        });
        it("Should fail: decrease offer price when offer does not exist", async () => {
            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(2, 2, {
                    from: wallet1,
                }),
                "Offer ID does not exist"
            );
        });

        it("Should fail: new price is higher than current price", async () => {
            const new_unit_price = 11;

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(offer_id, new_unit_price, {
                    from: wallet1,
                }),
                "New unit price should be lower than current unit price"
            );
            // assert new unit price
            const new_offer = await dutchAuction.offers(offer_id);
            assert.equal(new_offer.offer_unit_price_eth, offer_unit_price_eth);
        });

        it("Should succeed: change offer state to WITHDRAWN", async () => {
            // get liquid balance and locked balance

            const old_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            await dutchAuction.withdrawOffer(offer_id, {
                from: wallet1,
            });
            // assert
            const offer = await dutchAuction.offers(0);
            // Check status
            assert(offer.status == 1, "Offer status should be WITHDRAWN == 1");
            // check offer status
            const new_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);
            // new liquid should have more
            const liquid_difference = new_liquid.sub(old_liquid);
            const locked_difference = old_locked.sub(new_locked);
            // locked should have less
            assert.equal(
                liquid_difference.toString(),
                offer.quantity.toString()
            );
            assert.equal(
                locked_difference.toString(),
                offer.quantity.toString()
            );
        });

        it("Should fail: change offer state to WITHDRAWN when it is already WITHDRAWN", async () => {
            // withdraw an offer
            await dutchAuction.withdrawOffer(offer_id, {
                from: wallet1,
            });

            // get balance after withdraw
            const old_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(offer_id, 1, {
                    from: wallet1,
                }),
                "This offer is currently inactive"
            );
            // update price

            const new_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );

            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            assert.equal(new_liquid.toString(), old_liquid.toString());
            assert.equal(new_locked.toString(), old_locked.toString());
        });

        it("Should succeed: Offer state changed from WITHDRAWN to ACTIVE", async () => {
            // get before liquid and locked balance

            // withdraw offer
            await dutchAuction.withdrawOffer(offer_id, {
                from: wallet1,
            });

            // Balance after withdraw
            const old_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            await dutchAuction.reactivateOffer(offer_id, {
                from: wallet1,
            });

            // Balance after re activate
            const new_balance = await dutchAuction.getAccountBalance(
                wallet1,
                WBTC
            );

            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            // Difference should be price of offer

            // new liquid should have less
            const liquid_difference = old_liquid.sub(new_liquid);
            const locked_difference = new_locked.sub(old_locked);
            const offer = await dutchAuction.offers(0);

            // locked should have less
            assert.equal(
                liquid_difference.toString(),
                offer.quantity.toString()
            );
            assert.equal(
                locked_difference.toString(),
                offer.quantity.toString()
            );
        });

        it("should fail to re-activate offer due to lack of liquid balance", async () => {
            // get before liquid and locked balance
            // create offer
            // withdraw offer
            await dutchAuction.withdrawOffer(offer_id, {
                from: wallet1,
            });
            // withdraw token

            await dutchAuction.godModeSetStage(0, { from: owner });
            await dutchAuction.withdrawTokens(100, WBTC, {
                from: wallet1,
            });
            await dutchAuction.godModeSetStage(1, { from: owner });

            await truffleAssert.reverts(
                dutchAuction.reactivateOffer(offer_id, {
                    from: wallet1,
                }),
                "Insufficient liquid balance"
            );
        });

        it("Should fail: Offer state change to ACTIVE when it is already ACTIVE", async () => {
            await truffleAssert.reverts(
                dutchAuction.reactivateOffer(offer_id, {
                    from: wallet1,
                }),
                "This offer is currently not WITHDRAWN so it cannot be reactivated"
            );
        });

        it("Should fail: Others try to update your offer", async () => {
            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(offer_id, 1, {
                    from: owner,
                }),
                "Can only modify your own offer"
            );

            await truffleAssert.reverts(
                dutchAuction.decreaseOfferPrice(offer_id, 1, {
                    from: wallet2,
                }),
                "Can only modify your own offer"
            );
        });
    });
});
