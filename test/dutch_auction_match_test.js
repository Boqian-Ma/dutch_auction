const DutchAuction = artifacts.require("DutchAuction");
const WbtcContract = artifacts.require("Wbtc");
const truffleAssert = require("truffle-assertions");
const WethContract = artifacts.require("./WETH.sol");

const BN = require("bn.js");
const null_address = "0x0000000000000000000000000000000000000000";

contract("DutchAuction: Match", (accounts) => {
    let dutchAuction;
    let WBTCToken;
    // const deposit_amount = 100;
    let owner, wallet1, wallet2;
    const WBTC = web3.utils.asciiToHex("WBTC"); // change to bytes32
    const WETH = web3.utils.asciiToHex("WETH"); // change to bytes32

    owner = accounts[0];

    beforeEach(async () => {
        // await web3.eth.accounts.wallet.create(3); // create 3 accounts

        /** Create the new wallet so we have testing private keys*/
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
        WETHToken = await WethContract.new({
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
        result = await WETHToken.transfer(wallet1.address, 500);

        assert(result);

        // Deposit 100 WBTC
        await WBTCToken.approve(dutchAuction.address, 100, {
            from: wallet1.address,
        });
        await dutchAuction.depositTokens(100, WBTC, {
            from: wallet1.address,
        });

        // Deposit 100 WETH
        await WETHToken.approve(dutchAuction.address, 100, {
            from: wallet1.address,
        });

        // Deposit some ethers
        const tx = await dutchAuction.depositETH({
            from: wallet1.address,
            value: 1000,
        });

        // set global state to BID
        // await dutchAuction.godModeSetStage(2, { from: owner });
    });

    describe("find cheapest offer", () => {
        it("Should succeed: find cheap offer", async () => {
            // set offer
            await dutchAuction.godModeSetStage(1, { from: owner });
            await dutchAuction.createOffer(WBTC, 10, 10, {
                from: wallet1.address,
            });

            // offer 2
            await dutchAuction.createOffer(WBTC, 10, 9, {
                from: wallet1.address,
            });
            const res = await dutchAuction.findCheapestOffer(WBTC);

            assert.equal(res[0], true);
            assert.equal(res[1], 1);
        });

        it("Should fail: no cheap offer", async () => {
            const res = await dutchAuction.findCheapestOffer(WBTC);
            assert.equal(res[0], false);
            // assert.equal(res[1], 1);
        });
    });

    describe("match offer", () => {
        //
        it("Should succeed: simple matching", async () => {
            bid_unit_price_eth = 10;
            bid_quantity = 10;

            offer_unit_price_eth = 10;
            offer_quantity = 10;

            // create offer
            await dutchAuction.godModeSetStage(1, { from: owner });

            await dutchAuction.createOffer(
                WBTC,
                offer_quantity,
                offer_unit_price_eth,
                {
                    from: wallet1.address,
                }
            );
            await dutchAuction.godModeSetStage(2, { from: owner });
            // create bid

            const bid_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid_quantity, bid_unit_price_eth]
            );
            const bid_hash = web3.utils.keccak256(bid_encoded);

            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(signature.signature, {
                from: wallet1.address,
            });

            // await dutchAuction.createBid(
            //     WBTC,
            //     bid_quantity,
            //     bid_unit_price_eth,
            //     {
            //         from: wallet1,
            //     }
            // );

            // open bid
            // await dutchAuction.openBid(0, { from: wallet1 });
            await dutchAuction.openBid(
                0,
                wallet1.address,
                WBTC,
                bid_quantity,
                bid_unit_price_eth,
                { from: wallet1.address }
            );
            const old_balance = await dutchAuction.ethBalances(wallet1.address);
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            assert.equal(old_locked.toString(), "100");
            assert.equal(old_liquid.toString(), "900");

            const old_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );
            const old_token_liquid = new BN(old_token_balance.liquid);
            const old_token_locked = new BN(old_token_balance.locked);

            await dutchAuction.godModeSetStage(3, { from: owner });
            const tx = await dutchAuction.matchOffers({ from: owner });

            const bid = await dutchAuction.bids(0);
            assert.equal(bid.secondary_status, 2);
            assert.equal(bid.remaining_quantity, 0);

            const offer = await dutchAuction.offers(0);
            assert.equal(offer.status, 2);
            assert.equal(offer.remaining_quantity, 0);
            // check liquid and token of accounts

            // check eth balance
            const new_balance = await dutchAuction.ethBalances(wallet1.address);
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            assert.equal(
                new_liquid.sub(old_liquid).toString(),
                (bid_unit_price_eth * bid_quantity).toString()
            );
            assert.equal(
                old_locked.sub(new_locked).toString(),
                (bid_unit_price_eth * bid_quantity).toString()
            );

            const new_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );
            const new_token_liquid = new BN(new_token_balance.liquid);
            const new_token_locked = new BN(new_token_balance.locked);

            assert.equal(
                new_token_liquid.sub(old_token_liquid).toString(),
                bid_quantity.toString()
            );
            assert.equal(
                old_token_locked.sub(new_token_locked).toString(),
                bid_quantity.toString()
            );
        });

        it("Should succeed: simple matching with offer excess", async () => {
            bid1_unit_price_eth = 10;
            bid1_quantity = 10;

            offer_unit_price_eth = 10;
            offer_quantity = 20;

            // offer 1
            await dutchAuction.godModeSetStage(1, { from: owner });
            await dutchAuction.createOffer(
                WBTC,
                offer_quantity,
                offer_unit_price_eth,
                {
                    from: wallet1.address,
                }
            );

            // bid 1
            await dutchAuction.godModeSetStage(2, {
                from: owner,
            });
            const bid_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid_quantity, bid_unit_price_eth]
            );
            const bid_hash = web3.utils.keccak256(bid_encoded);

            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(signature.signature, {
                from: wallet1.address,
            });

            await dutchAuction.openBid(
                0,
                wallet1.address,
                WBTC,
                bid_quantity,
                bid_unit_price_eth,
                { from: wallet1.address }
            );

            const old_balance = await dutchAuction.ethBalances(wallet1.address);
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            assert.equal(old_locked.toString(), "100");
            assert.equal(old_liquid.toString(), "900");

            const old_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );

            const old_token_liquid = new BN(old_token_balance.liquid);
            const old_token_locked = new BN(old_token_balance.locked);
            // open bid
            // await dutchAuction.openBid(1, { from: wallet1 });

            await dutchAuction.godModeSetStage(3, {
                from: owner,
            });

            const tx = await dutchAuction.matchOffers({ from: owner });

            const bid1 = await dutchAuction.bids(0);
            assert.equal(bid1.secondary_status.toString(), 2);
            assert.equal(bid1.remaining_quantity, 0);

            const offer = await dutchAuction.offers(0);
            assert.equal(offer.status.toString(), 0);
            assert.equal(offer.remaining_quantity.toString(), "10");
            // check liquid and token of accounts

            // check eth balance
            const new_balance = await dutchAuction.ethBalances(wallet1.address);
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            assert.equal(
                new_liquid.sub(old_liquid).toString(),
                (bid1_unit_price_eth * bid1_quantity).toString()
            );
            assert.equal(
                old_locked.sub(new_locked).toString(),
                (bid1_unit_price_eth * bid1_quantity).toString()
            );

            const new_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );
            const new_token_liquid = new BN(new_token_balance.liquid);
            const new_token_locked = new BN(new_token_balance.locked);

            assert.equal(
                new_token_liquid.sub(old_token_liquid).toString(),
                bid1_quantity.toString()
            );
            assert.equal(
                old_token_locked.sub(new_token_locked).toString(),
                bid1_quantity.toString()
            );
        });

        it("Should succeed: Multiple bids with excess funds transfered", async () => {
            // bid 1
            bid1_unit_price_eth = 2;
            bid1_quantity = 5;

            // bid 2 -> should still be active
            bid2_unit_price_eth = 3;
            bid2_quantity = 6;

            // offer
            offer_unit_price_eth = 1;
            offer_quantity = 10;

            // offer 1
            await dutchAuction.godModeSetStage(1, {
                from: owner,
            });
            await dutchAuction.createOffer(
                WBTC,
                offer_quantity,
                offer_unit_price_eth,
                {
                    from: wallet1.address,
                }
            );

            // bid 1
            await dutchAuction.godModeSetStage(2, {
                from: owner,
            });

            const bid1_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid1_quantity, bid1_unit_price_eth]
            );
            const bid1_hash = web3.utils.keccak256(bid1_encoded);

            signature = await web3.eth.accounts.sign(
                bid1_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(signature.signature, {
                from: wallet1.address,
            });

            // bid 2

            const bid2_encoded = web3.eth.abi.encodeParameters(
                ["bytes32", "uint256", "uint256"],
                [WBTC, bid2_quantity, bid2_unit_price_eth]
            );
            const bid2_hash = web3.utils.keccak256(bid2_encoded);

            signature_2 = await web3.eth.accounts.sign(
                bid2_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(signature_2.signature, {
                from: wallet1.address,
            });

            // Open bid 1 and 2

            await dutchAuction.openBid(
                0,
                wallet1.address,
                WBTC,
                bid1_quantity,
                bid1_unit_price_eth,
                { from: wallet1.address }
            );
            await dutchAuction.openBid(
                1,
                wallet1.address,
                WBTC,
                bid2_quantity,
                bid2_unit_price_eth,
                { from: wallet1.address }
            );

            const old_balance = await dutchAuction.ethBalances(wallet1.address);
            const old_liquid = new BN(old_balance.liquid);
            const old_locked = new BN(old_balance.locked);

            assert.equal(old_locked.toString(), "28");
            assert.equal(old_liquid.toString(), "972");

            const old_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );
            const old_token_liquid = new BN(old_token_balance.liquid);
            const old_token_locked = new BN(old_token_balance.locked);
            // open bid

            await dutchAuction.godModeSetStage(3, {
                from: owner,
            });
            const tx = await dutchAuction.matchOffers({ from: owner });

            // bid 1should be closed
            const bid1 = await dutchAuction.bids(0);
            assert.equal(bid1.secondary_status.toString(), "2"); // closed
            assert.equal(bid1.remaining_quantity.toString(), "0"); // empty

            // bid 2 is still active
            const bid2 = await dutchAuction.bids(1);
            assert.equal(bid2.secondary_status.toString(), "0"); // active
            assert.equal(bid2.remaining_quantity.toString(), "1"); // one is still unfull filled

            // offer should be closed
            const offer = await dutchAuction.offers(0);
            assert.equal(offer.status.toString(), "2"); // closed
            assert.equal(offer.remaining_quantity.toString(), "0"); // no more WBTC

            // excess amount
            const excess = bid2.bid_unit_price_eth * bid2.remaining_quantity;

            assert.equal(excess.toString(), "3");

            // check liquid and token of accounts

            // check eth balance
            const new_balance = await dutchAuction.ethBalances(wallet1.address);
            const new_liquid = new BN(new_balance.liquid);
            const new_locked = new BN(new_balance.locked);

            assert.equal(
                new_liquid.sub(old_liquid).toString(),
                (
                    bid1_unit_price_eth * bid1_quantity +
                    bid2_unit_price_eth * bid2_quantity -
                    excess
                ).toString()
            );
            assert.equal(
                old_locked.sub(new_locked).toString(),
                (
                    bid1_unit_price_eth * bid1_quantity +
                    bid2_unit_price_eth * bid2_quantity -
                    excess
                ).toString()
            );

            const new_token_balance = await dutchAuction.accountBalances(
                wallet1.address,
                WBTC
            );
            const new_token_liquid = new BN(new_token_balance.liquid);
            const new_token_locked = new BN(new_token_balance.locked);

            assert.equal(
                new_token_liquid.sub(old_token_liquid).toString(),
                (
                    bid1_quantity +
                    bid2_quantity -
                    bid2.remaining_quantity
                ).toString()
            );
            assert.equal(
                old_token_locked.sub(new_token_locked).toString(),
                (
                    bid1_quantity +
                    bid2_quantity -
                    bid2.remaining_quantity
                ).toString()
            );
        });
    });
});
