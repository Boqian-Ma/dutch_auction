const Web3 = require("web3");

const DutchAuction = artifacts.require("./DutchAuction.sol");
const WbtcContract = artifacts.require("./WBTC.sol");
const WethContract = artifacts.require("./WETH.sol");

const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

const web3 = new Web3(DutchAuction.web3.currentProvider);

contract("DuctchAuction: Hidden bids", (accounts) => {
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
            value: 100,
        });

        // set global state to BID
        await dutchAuction.godModeSetStage(2, { from: owner });
    });

    describe("Dutch Auction: Bid creation", () => {
        const bid_quantity = 10;
        const bid_unit_price_eth = 1;
        const bid_encoded = web3.eth.abi.encodeParameters(
            ["bytes32", "uint256", "uint256"],
            [WBTC, bid_quantity, bid_unit_price_eth]
        );
        let signature;
        const bid_hash = web3.utils.keccak256(bid_encoded);

        beforeEach(async () => {
            // Sign message
            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );
        });

        it("Should Succeed: Hidden bid creation (create from own account)", async () => {
            // create a bid with signature
            await dutchAuction.createBid(signature.signature, {
                from: wallet1.address,
            });

            bid_count = await dutchAuction.bid_count();
            assert.equal(bid_count, 1);
            // get bid content
            const bid = await dutchAuction.bids(0);
            // Assert values
            assert.equal(bid.id, 0);
            assert.equal(bid.created_by, wallet1.address);
            assert.equal(web3.utils.hexToUtf8(bid.symbol), "");
            assert.equal(bid.quantity.toString(), "0");
            assert.equal(bid.remaining_quantity.toString(), "0");
            assert.equal(bid.bid_unit_price_eth.toString(), "0");
            assert(Date.now() > bid.creation_time);
            assert.equal(bid.primary_status, 0); // 0 corresponds to hidden, 1 is opened
            assert.equal(bid.secondary_status, 0); // 0 is active, 1 is withdrawn, 2 is closed
        });

        it("Should Succeed: Hidden bid creation (create from another account)", async () => {
            // create a bid with signature
            await dutchAuction.createBid(signature.signature, {
                from: wallet2.address,
            });

            bid_count = await dutchAuction.bid_count();
            assert.equal(bid_count, 1);
            // get bid content
            const bid = await dutchAuction.bids(0);
            // Assert values
            assert.equal(bid.id, 0);
            assert.equal(bid.created_by, wallet2.address);
            assert.equal(web3.utils.hexToUtf8(bid.symbol), "");
            assert.equal(bid.quantity.toString(), "0");
            assert.equal(bid.remaining_quantity.toString(), "0");
            assert.equal(bid.bid_unit_price_eth.toString(), "0");
            assert(Date.now() > bid.creation_time);
            assert.equal(bid.primary_status, 0); // 0 corresponds to hidden, 1 is opened
            assert.equal(bid.secondary_status, 0); // 0 is active, 1 is withdrawn, 2 is closed
        });
    });

    describe("Dutch Auction: Bid opening", () => {
        const bid_quantity = 10;
        const bid_unit_price_eth = 1;
        const bid_encoded = web3.eth.abi.encodeParameters(
            ["bytes32", "uint256", "uint256"],
            [WBTC, bid_quantity, bid_unit_price_eth]
        );
        let signature;
        let weth_signature;

        const bid_hash = web3.utils.keccak256(bid_encoded);

        const weth_bid_encoded = web3.eth.abi.encodeParameters(
            ["bytes32", "uint256", "uint256"],
            [WETH, bid_quantity, bid_unit_price_eth]
        );
        const weth_bid_hash = web3.utils.keccak256(weth_bid_encoded);

        beforeEach(async () => {
            // create a bid
            signature = await web3.eth.accounts.sign(
                bid_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(signature.signature, {
                from: wallet1.address,
            });

            weth_signature = await web3.eth.accounts.sign(
                weth_bid_hash,
                wallet1.privateKey
            );
            await dutchAuction.createBid(weth_signature.signature, {
                from: wallet1.address,
            });
        });

        it("open a bid", async () => {
            await dutchAuction.openBid(
                0,
                wallet1.address,
                WBTC,
                bid_quantity,
                bid_unit_price_eth,
                { from: wallet1.address }
            );

            // verify bid content and state
            const bid = await dutchAuction.bids(0);

            assert.equal(bid.id, 0);
            assert.equal(bid.created_by, wallet1.address);
            assert.equal(web3.utils.hexToUtf8(bid.symbol), "WBTC");
            assert.equal(bid.quantity.toString(), "10");
            assert.equal(bid.remaining_quantity.toString(), "10");
            assert.equal(bid.bid_unit_price_eth.toString(), "1");
            assert(Date.now() > bid.creation_time);
            assert.equal(bid.primary_status, 1); // 0 corresponds to hidden, 1 is opened
            assert.equal(bid.secondary_status, 0); // 0 is active, 1 is withdrawn, 2 is closed
        });

        it("Should fail: open a bid that is not yours", async () => {
            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet2.address }
                ),
                "Only the bid owner is allowed to open the bid"
            );
        });

        it("Should fail: bid signature mismatch", async () => {
            // incorrect quantity provided
            const wrong_bid_quantity = 100;

            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    wrong_bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "Signature verification failed"
            );
        });

        it("Should fail: Open bid with insufficient balance", async () => {
            var contract_balance = await dutchAuction.ethBalances(
                wallet1.address
            );
            var liquid_balance = contract_balance.liquid;

            await dutchAuction.godModeSetStage(0, { from: owner });
            await dutchAuction.withdrawETH(liquid_balance, {
                from: wallet1.address,
            });

            await dutchAuction.godModeSetStage(2, { from: owner });
            await truffleAssert.reverts(
                dutchAuction.openBid(
                    0,
                    wallet1.address,
                    WBTC,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "Insufficient liquid ETH balance"
            );
        });

        it("Should fail: Token not in whitelist", async () => {
            await dutchAuction.godModeSetStage(2, { from: owner });
            await truffleAssert.reverts(
                dutchAuction.openBid(
                    1,
                    wallet1.address,
                    WETH,
                    bid_quantity,
                    bid_unit_price_eth,
                    { from: wallet1.address }
                ),
                "Token is not in whitelist"
            );
        });
    });
});
