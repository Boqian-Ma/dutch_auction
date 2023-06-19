// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
import "../node_modules/@openzeppelin/contracts/token//ERC20/IERC20.sol";
import "./StateMachine.sol";
import "./DutchAuctionVerify.sol";

contract DutchAuction is Ownable, StateMachine, DutchAuctionVerify {
    // Events
    event DepositEth(address _from, uint256 _value);
    event withdrawEth(address _to, uint256 _value);
    event DepositToken(address __from, bytes32 _symbol, uint256 _value);
    event withdrawToken(address to, bytes32 _symbol, uint256 _value);

    // When an offer is created
    event OfferCreated(
        uint _offer_id,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _offer_unit_price_eth
    );

    // When a bid is created
    event BidCreated(uint _bid_id);

    // When an offer is matched to a bid
    event Matched(
        uint256 _offer_id,
        uint256 _bid_id,
        uint256 _eth_price,
        bytes32 _symbol,
        uint256 _token_quantity
    );

    // Whitelisted tokens
    mapping(bytes32 => address) public whitelistedTokens;

    // ERC20 tokens balance
    mapping(address => mapping(bytes32 => Wallet)) public accountBalances;

    // ETH balance
    mapping(address => Wallet) public ethBalances;

    // Token wallet
    struct Wallet {
        uint256 liquid; // can be used to create bids/offers freely
        uint256 locked; // locked in bids and offers
    }

    // Offer data structure
    enum OfferStatus {
        ACTIVE, // When an offer can be matched with a bid
        WITHDRAWN, // When an offer cannot be matched with a bid
        CLOSED // When an offer is fully matched with bids
    }
    struct Offer {
        uint256 id;
        address created_by;
        bytes32 symbol; // When an offer is created, it is assumed that its been whitelisted
        uint256 quantity; // Fixed value
        uint256 remaining_quantity;
        uint256 offer_unit_price_eth;
        uint256 creation_time;
        OfferStatus status;
    }

    Offer[] public offers;
    uint256 public offer_count;

    // Bid data structure

    // Bid states
    enum BidStatusPrimary {
        HIDDEN, // When the content of the bid is hidden
        OPENED // When the bid is revealed
    }

    enum BidStatusSecondary {
        ACTIVE, // When the bid is able to match with offers
        WITHDRAWN, // When the bid is withdrawn by the bidder
        CLOSED // When the bid has been successfully matched with an offer
    }

    struct Bid {
        uint256 id;
        address created_by; // the account who created the bid
        address bid_owner; // the actual owner of the bid
        bytes32 symbol; // When an offer is created, it is assumed that its been whitelisted
        uint256 quantity;
        uint256 remaining_quantity;
        uint256 bid_unit_price_eth;
        bytes signature;
        uint256 creation_time;
        BidStatusPrimary primary_status;
        BidStatusSecondary secondary_status;
    }

    Bid[] public bids;
    uint256 public bid_count;

    fallback() external payable {
        ethBalances[msg.sender].liquid += msg.value;
    }

    receive() external payable {
        ethBalances[msg.sender].liquid += msg.value;
    }

    /**
     * @notice  Get account balance.
     * @param   _wallet_address  Address of account we wish to check.
     * @param   _symbol  Token symbol.
     * @return  Token Wallet object .
     */
    function getAccountBalance(
        address _wallet_address,
        bytes32 _symbol
    ) public view tokenInWhitelist(_symbol) returns (Wallet memory) {
        return accountBalances[_wallet_address][_symbol];
    }

    /**
     * @notice  Add a token to whitelist.
     * @dev     Only contract owner is allowed to perform this action.
     * @param   _symbol  Token symbol.
     * @param   _tokenAddress  ERC20 contract address of token.
     */
    function addToken(bytes32 _symbol, address _tokenAddress) public onlyOwner {
        require(
            whitelistedTokens[_symbol] == address(0),
            "Token already exists"
        );
        whitelistedTokens[_symbol] = _tokenAddress;
    }

    /**
     * @notice Deposit ETH to contract.
     */
    function depositETH()
        public
        payable
        timedTransitions
        atStage(Stages.DEPOSIT_WITHDRAW)
    {
        // msg.sender deposits tokens
        ethBalances[msg.sender].liquid += msg.value;
        emit DepositEth(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from contract, must have enough balance.
     * @dev _amount > 0
     * @param   _amount  Amount to withdraw > 0.
     */
    function withdrawETH(
        uint256 _amount
    ) external payable timedTransitions atStage(Stages.DEPOSIT_WITHDRAW) {
        // account has enough money
        require(
            ethBalances[msg.sender].liquid >= _amount,
            "Insufficient balance"
        );

        ethBalances[msg.sender].liquid -= _amount;

        (bool success, ) = msg.sender.call{value: _amount}("");
        require(success, "Failed to send funds");

        emit withdrawEth(msg.sender, _amount);
    }

    /**
     * @notice  Deposit ERC20 token.
     * @dev     _amount > 0 and _symbol must be in whitelist.
     * @param   _amount  Deposit amount.
     * @param   _symbol  Token Symbol.
     */
    function depositTokens(
        uint256 _amount,
        bytes32 _symbol
    )
        public
        timedTransitions
        atStage(Stages.DEPOSIT_WITHDRAW)
        tokenInWhitelist(_symbol)
    {
        require(_amount > 0, "Can only deposit positive integer amount");
        // check if token exists in whitelist
        IERC20 token = IERC20(whitelistedTokens[_symbol]);
        require(token.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        require(
            token.allowance(msg.sender, address(this)) >= _amount,
            "TokenDeposit: insufficient allowance"
        );

        require(
            token.transferFrom(msg.sender, address(this), _amount),
            "Token transfer failed"
        );
        // Update the depositor's account balance
        accountBalances[msg.sender][_symbol].liquid += _amount;

        emit DepositToken(msg.sender, _symbol, _amount);
    }

    /**
     * @notice  Withdraw ERC20 tokens.
     * @param   _amount  Token amount.
     * @param   _symbol  Token symbol.
     */
    function withdrawTokens(
        uint256 _amount,
        bytes32 _symbol
    )
        public
        timedTransitions
        atStage(Stages.DEPOSIT_WITHDRAW)
        tokenInWhitelist(_symbol)
    {
        require(_amount > 0, "Can only withdraw positive integer amount");
        require(
            accountBalances[msg.sender][_symbol].liquid >= _amount,
            "Insufficient liquid balance"
        );
        address tokenAddress = whitelistedTokens[_symbol];

        IERC20 token = IERC20(tokenAddress);
        accountBalances[msg.sender][_symbol].liquid -= _amount;

        require(
            token.transfer(msg.sender, _amount),
            "Unable to transfer token"
        );
        emit withdrawToken(msg.sender, _symbol, _amount);
    }

    // Offer Functions

    /// @notice Public function to create an offer
    /// @notice The message sender must
    /// @param _symbol The ERC20 token symbol
    /// @param _quantity Quantity of token
    /// @param _offer_unit_price_eth Unit price of each token
    function createOffer(
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _offer_unit_price_eth
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_OFFERS)
        tokenInWhitelist(_symbol)
        sufficientLiquidBalance(_symbol, _quantity)
    {
        require(_quantity > 0, "Quantity must be a positive integer");
        require(
            _offer_unit_price_eth > 0,
            "Offer price must be a positive integer"
        );

        // create offer
        Offer memory offer = Offer(
            offer_count,
            msg.sender,
            _symbol,
            _quantity,
            _quantity,
            _offer_unit_price_eth,
            block.timestamp,
            OfferStatus.ACTIVE
        );

        _lockAsset(_symbol, _quantity);
        offers.push(offer);

        emit OfferCreated(
            offer_count,
            _symbol,
            _quantity,
            _offer_unit_price_eth
        );
        offer_count += 1;
    }

    /**
     * @notice Decrease offer price. New price must be less than current price.
     * @dev     _new_unit_price > 0.
     * @param   _offer_id  Offer ID.
     * @param   _new_unit_price  New unit price.
     */
    function decreaseOfferPrice(
        uint256 _offer_id,
        uint256 _new_unit_price
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_OFFERS)
        offerExists(_offer_id)
        offerOwner(_offer_id)
        offerIsActive(_offer_id)
    {
        require(_new_unit_price > 0, "New price must be a positive integer");
        require(
            _new_unit_price < offers[_offer_id].offer_unit_price_eth,
            "New unit price should be lower than current unit price"
        );
        offers[_offer_id].offer_unit_price_eth = _new_unit_price;
    }

    /**
     * @notice  Change offer state from WITHDRAWN to ACTIVE.
     * @param   _offer_id  Offer id.
     */
    function reactivateOffer(
        uint256 _offer_id
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_OFFERS)
        offerExists(_offer_id)
        offerIsWithdrawn(_offer_id)
        offerOwner(_offer_id)
        sufficientLiquidBalance(
            offers[_offer_id].symbol,
            offers[_offer_id].quantity
        )
    {
        offers[_offer_id].status = OfferStatus.ACTIVE;
        _lockAsset(
            offers[_offer_id].symbol,
            offers[_offer_id].remaining_quantity
        );
    }

    /**
     * @notice  Change an offer state from ACTIVE to WITHDRAW.
     * @param   _offer_id Offer ID .
     */
    function withdrawOffer(
        uint256 _offer_id
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_OFFERS)
        offerExists(_offer_id)
        offerIsActive(_offer_id)
        offerOwner(_offer_id)
    {
        // Change the status of an offer to withdrawn
        offers[_offer_id].status = OfferStatus.WITHDRAWN;
        // Update move locked fund in offer to liquid balance
        _freeAsset(
            offers[_offer_id].symbol,
            offers[_offer_id].remaining_quantity
        );
    }

    /**
     * @notice  Move token from liquid to locked.
     * @param   _symbol  Token symbol.
     * @param   _quantity  Quantity.
     */
    function _lockAsset(
        bytes32 _symbol,
        uint256 _quantity
    ) private sufficientLiquidBalance(_symbol, _quantity) {
        // Only call as private function
        accountBalances[msg.sender][_symbol].liquid -= _quantity;
        accountBalances[msg.sender][_symbol].locked += _quantity;
    }

    /**
     * @notice  Move token from liquid to locked.
     * @param   _symbol  Token symbol.
     * @param   _quantity  Quantity.
     */
    function _freeAsset(bytes32 _symbol, uint256 _quantity) private {
        // Only call as private function
        accountBalances[msg.sender][_symbol].liquid += _quantity;
        accountBalances[msg.sender][_symbol].locked -= _quantity;
    }

    /**
     * @notice  Move liquid ETH to locked.
     * @param   _amount  Token amount.
     */
    function _lockEth(
        uint256 _amount
    ) private sufficientEthLiquidBalance(_amount) {
        ethBalances[msg.sender].liquid -= _amount;
        ethBalances[msg.sender].locked += _amount;
    }

    /**
     * @notice  Move locked ETH to liquid.
     * @param   _amount  Token amount.
     */
    function _freeEth(uint256 _amount) private {
        ethBalances[msg.sender].liquid += _amount;
        ethBalances[msg.sender].locked -= _amount;
    }

    /**
     * @notice  Change offer state to CLOSED
     * @dev     Offer has to first be active.
     * @param   _offer_id  .
     */
    function _closeOffer(uint256 _offer_id) private offerIsActive(_offer_id) {
        // set offer status to close
        offers[_offer_id].status = OfferStatus.CLOSED;
    }

    /**
     * @notice  .
     * @dev     .
     */
    function createBid(
        bytes memory _signature
    ) public timedTransitions atStage(Stages.ACCEPTING_BIDS) {
        // create a hidden bid
        Bid memory bid = Bid(
            bid_count,
            msg.sender,
            address(0),
            bytes32(0), // When an offer is created, it is not assumed that the token been whitelisted
            0,
            0,
            0,
            _signature,
            block.timestamp,
            BidStatusPrimary.HIDDEN,
            BidStatusSecondary.ACTIVE
        );

        bids.push(bid);
        emit BidCreated(bid_count);
        bid_count += 1;
    }

    /**
     * @notice  Change bid state from ACTIVE to WITHDRAW.
     * @dev     Bid second state has to be ACTIVE.
     * @param   _bid_id  Bid ID.
     */
    function withdrawBid(
        uint256 _bid_id
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_BIDS)
        bidExists(_bid_id)
        bidOwner(_bid_id)
        bidIsActive(_bid_id)
    {
        // update liquid balance
        bids[_bid_id].secondary_status = BidStatusSecondary.WITHDRAWN;
        // Update move locked fund in offer to liquid balance
        _freeEth(
            bids[_bid_id].bid_unit_price_eth * bids[_bid_id].remaining_quantity
        );
    }

    /**
     * @notice  Change bid secondary state from WITHDRAWN to ACTIVE.
     * @dev     Bid current state has to be WITHDRAWN.
     * @param   _bid_id  Bid ID.
     */
    function reactivateBid(
        uint256 _bid_id
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_BIDS)
        bidExists(_bid_id)
        bidOwner(_bid_id)
        bidIsWithdrawn(_bid_id)
    {
        bids[_bid_id].secondary_status = BidStatusSecondary.ACTIVE;
        _lockEth(
            bids[_bid_id].bid_unit_price_eth * bids[_bid_id].remaining_quantity
        );
    }

    /**
     * @notice  Change bid primary state from HIDDEN to OPENED.
     * @param   _bid_id  .
     */
    function openBid(
        uint256 _bid_id,
        address _bid_owner,
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _bid_unit_price_eth
    )
        public
        timedTransitions
        atStage(Stages.ACCEPTING_BIDS)
        bidExists(_bid_id)
        bidIsHidden(_bid_id)
        bidIsActive(_bid_id)
        tokenInWhitelist(_symbol)
    {
        require(
            msg.sender == _bid_owner,
            "Only the bid owner is allowed to open the bid"
        );

        require(_quantity > 0, "Quantity must be a positive integer");
        require(
            _bid_unit_price_eth > 0,
            "Bid price must be a positive integer"
        );
        bytes32 prefixed_hash_message = _hashBid(
            _symbol,
            _quantity,
            _bid_unit_price_eth
        );

        bool result = _verifyMessage(
            _bid_owner,
            prefixed_hash_message,
            bids[_bid_id].signature
        );
        // verify message
        require(result, "Signature verification failed");

        // set status to open
        // ensure enough balance. msg.sender should be the owner after verification checks

        _lockEth(_bid_unit_price_eth * _quantity);
        // Fill in rest of bid
        bids[_bid_id].bid_owner = _bid_owner;
        bids[_bid_id].symbol = _symbol;
        bids[_bid_id].quantity = _quantity;
        bids[_bid_id].remaining_quantity = _quantity;
        bids[_bid_id].bid_unit_price_eth = _bid_unit_price_eth;
        // Set primary status to OPENED
        bids[_bid_id].primary_status = BidStatusPrimary.OPENED;
    }

    /**
     * @notice  Transfer ERC20 token from seller to bidder intra contract.
     * @param   _seller  Seller address.
     * @param   _buyer  Bidder address.
     * @param   _symbol  Token symbol.
     * @param   _quantity  Quantity.
     */
    function _transferTokenFromSellerToBuyer(
        address _seller,
        address _buyer,
        bytes32 _symbol,
        uint256 _quantity
    ) private {
        // decrease (not free, but remove) locked token quantity in seller
        accountBalances[_seller][_symbol].locked -= _quantity;
        // increase liquid amount to buyer
        accountBalances[_buyer][_symbol].liquid += _quantity;
    }

    /**
     * @notice   Transfer ETH token from seller to bidder intra contract.
     * @param   _seller  Seller address.
     * @param   _buyer  Bidder address.
     * @param   _eth_quantity Total ETH quantity to be transfered .
     */
    function _transferEthFromBuyerToSeller(
        address _buyer,
        address _seller,
        uint256 _eth_quantity // token amount * unit price
    ) private {
        // decrease (not free, but remove) locked ETH quantity in buyer
        // increase liquid ETH amount to buyer
        ethBalances[_buyer].locked -= _eth_quantity; // buyer pay seller
        ethBalances[_seller].liquid += _eth_quantity;
    }

    /**
     * @notice  Update Offer remaining token quantity.
     * @param   _offer_id  Offer ID.
     * @param   _deduct_token_amount  Number of tokens to remove from offer after matching.
     */
    function _updateOfferTokenBalance(
        uint256 _offer_id,
        uint256 _deduct_token_amount
    ) private {
        // update remaining balance
        offers[_offer_id].remaining_quantity -= _deduct_token_amount;
        // update state if remaining balance is zero
        if (offers[_offer_id].remaining_quantity == 0) {
            // update state
            offers[_offer_id].status = OfferStatus.CLOSED;
        }
    }

    /**
     * @notice  Update Offer remaining token quantity.
     * @param   _bid_id  Bid ID.
     * @param   _deduct_token_amount  Number of tokens to remove from offer after matching.
     * @return  bool  True if bid secondary state still ACTIVE. False if not.
     */
    function _updateBidTokenBalance(
        uint256 _bid_id,
        uint256 _deduct_token_amount
    ) private returns (bool) {
        // update remaining balance
        bids[_bid_id].remaining_quantity -= _deduct_token_amount;

        // update state if remaining balance is zero
        if (bids[_bid_id].remaining_quantity == 0) {
            // update state
            bids[_bid_id].secondary_status = BidStatusSecondary.CLOSED;
            return false;
        }
        return true;
    }

    /**
     * @notice  Match offer and bid price to determine the final agreeable price.
     * @param   _bid_eth_price  Bid price in ETH.
     * @param   _offer_eth_price  Offer price in ETH.
     * @return  bool  True if offer price <= bid price. False if otherwise.
     * @return  uint256  Matched offer price.
     * @return  uint256  Spread between offer and bid price, this amount is refunded to the bidder.
     */
    function _matchPrice(
        uint256 _bid_eth_price,
        uint256 _offer_eth_price
    ) private pure returns (bool, uint256, uint256) {
        // check if bid price is lower than offer price, if it is, the we have a match
        if (_bid_eth_price >= _offer_eth_price) {
            return (
                true,
                _offer_eth_price,
                (_bid_eth_price - _offer_eth_price)
            ); // price deducted
        }
        return (false, 0, 0);
    }

    /**
     * @notice  Match the amount of ERC20 tokens the bidder can purchase.
     * @param   _bid_quantity  Bid token quantity.
     * @param   _offer_quantity  Offer token quantity.
     * @return  uint256  min(_bid_quantity, _offer_quantity).
     */
    function _matchTokenQuantity(
        uint256 _bid_quantity,
        uint256 _offer_quantity
    ) private pure returns (uint256) {
        // returns the maximum amount we can match i.e. max amount we can deduct from both offer and bid
        if (_bid_quantity >= _offer_quantity) {
            return _offer_quantity;
        }
        return _bid_quantity;
    }

    /**
     * @notice  If bid price is higher than offer price, the excess is refunded to the bidder.
     * @param   _excess_amount Excess amount .
     * @param   _buyer  Bidder address.
     */
    function _refundExcessEth(uint256 _excess_amount, address _buyer) private {
        ethBalances[_buyer].liquid += _excess_amount;
        ethBalances[_buyer].locked -= _excess_amount;
    }

    /**
     * @notice  Find the cheapest offer given symbol.
     * @dev     Symbol is assumed to exist.
     * @param   _symbol  Token Symbol.
     * @return  bool True if found, false otherwise .
     * @return  uint256  Offer ID if found, 0 otherwise.
     */
    function findCheapestOffer(
        bytes32 _symbol
    ) public view tokenInWhitelist(_symbol) returns (bool, uint256) {
        // pass
        uint256 min_price = type(uint256).max;
        uint256 min_offer_id = type(uint256).max;
        bool found = false;

        for (
            uint256 offer_index = 0;
            offer_index < offer_count;
            offer_index++
        ) {
            if (
                offers[offer_index].symbol == _symbol && // match symbol
                offers[offer_index].offer_unit_price_eth <= min_price && // offer below bid price
                offers[offer_index].status == OfferStatus.ACTIVE // offer is still active
            ) {
                min_price = offers[offer_index].offer_unit_price_eth;
                min_offer_id = offer_index;
                found = true;
            }
        }

        return (found, min_offer_id);
    }

    /**
     * @notice  Match offer.
     * @dev     After matchOffers() ends, the state is updated to DEPOSITE_WITHDRAW.
     */
    function matchOffers()
        public
        timedTransitions
        atStage(Stages.MATCHING)
        transitionNext
    {
        for (uint bid_index = 0; bid_index < bid_count; bid_index++) {
            // if bid is active and opened
            if (
                bids[bid_index].primary_status == BidStatusPrimary.OPENED &&
                bids[bid_index].secondary_status == BidStatusSecondary.ACTIVE
            ) {
                Bid memory curr_bid = bids[bid_index];

                // while a cheap offer exist
                (bool cheap_exist, uint256 offer_index) = findCheapestOffer(
                    curr_bid.symbol
                );

                bool bid_active = true;
                while (cheap_exist && bid_active) {
                    Offer memory curr_offer = offers[offer_index];

                    // match price
                    (
                        bool price_match,
                        uint agreed_unit_price,
                        uint excess
                    ) = _matchPrice(
                            curr_bid.bid_unit_price_eth,
                            curr_offer.offer_unit_price_eth
                        );

                    if (price_match) {
                        // if matched
                        uint256 deduct_token_quantity = _matchTokenQuantity(
                            curr_bid.remaining_quantity,
                            curr_offer.remaining_quantity
                        );

                        uint256 total_price_eth = deduct_token_quantity *
                            agreed_unit_price; // agreed eth price is always smaller

                        // update curr offer token balance
                        _updateOfferTokenBalance(
                            offer_index,
                            deduct_token_quantity
                        );

                        // update curr bid token balance
                        bid_active = _updateBidTokenBalance(
                            bid_index,
                            deduct_token_quantity
                        );

                        // Transfer token between seller and buyer
                        _transferEthFromBuyerToSeller(
                            curr_bid.created_by, // buyer
                            curr_offer.created_by, // seller
                            total_price_eth
                        );
                        // Transfer eth between seller and buyer
                        _transferTokenFromSellerToBuyer(
                            curr_offer.created_by, //seller
                            curr_bid.created_by, // buyer
                            curr_offer.symbol,
                            deduct_token_quantity
                        );

                        // if bid price smaller than
                        _refundExcessEth(
                            deduct_token_quantity * excess,
                            curr_bid.created_by
                        );

                        emit Matched(
                            offer_index,
                            bid_index,
                            total_price_eth,
                            curr_bid.symbol,
                            deduct_token_quantity
                        );
                    }
                    // reset check
                    (cheap_exist, offer_index) = findCheapestOffer(
                        curr_bid.symbol
                    );
                }
            }
        }
    }

    modifier tokenInWhitelist(bytes32 _symbol) {
        require(
            whitelistedTokens[_symbol] != address(0),
            "Token is not in whitelist"
        );
        _;
    }

    modifier sufficientLiquidBalance(bytes32 _symbol, uint _amount) {
        require(
            accountBalances[msg.sender][_symbol].liquid >= _amount,
            "Insufficient liquid balance"
        );
        _;
    }

    modifier sufficientEthLiquidBalance(uint256 _eth_quantity) {
        require(
            ethBalances[msg.sender].liquid >= _eth_quantity,
            "Insufficient liquid ETH balance"
        );
        _;
    }

    // Offer modifiers
    modifier offerOwner(uint256 _offer_id) {
        require(
            offers[_offer_id].created_by == msg.sender,
            "Can only modify your own offer"
        );
        _;
    }

    modifier offerExists(uint256 _offer_id) {
        require(_offer_id < offer_count, "Offer ID does not exist");
        _;
    }

    // modifier to check if an offer is active
    modifier offerIsActive(uint256 _offer_id) {
        require(
            offers[_offer_id].status == OfferStatus.ACTIVE,
            "This offer is currently inactive"
        );
        _;
    }

    //
    modifier offerIsWithdrawn(uint256 _offer_id) {
        require(
            offers[_offer_id].status == OfferStatus.WITHDRAWN,
            "This offer is currently not WITHDRAWN so it cannot be reactivated"
        );
        _;
    }

    // bid modifiers
    modifier bidOwner(uint256 _bid_id) {
        require(
            msg.sender == bids[_bid_id].created_by,
            "You are not the bid owner"
        );
        _;
    }

    modifier bidExists(uint256 _bid_id) {
        require(_bid_id < bid_count, "This bid does not exist");
        _;
    }
    modifier bidIsActive(uint256 _bid_id) {
        require(
            bids[_bid_id].secondary_status == BidStatusSecondary.ACTIVE,
            "This offer is currently withdrawn or closed"
        );
        _;
    }

    modifier bidIsWithdrawn(uint256 _bid_id) {
        require(
            bids[_bid_id].secondary_status == BidStatusSecondary.WITHDRAWN,
            "This bid is currently not WITHDRAWN so it cannot be reactivated"
        );
        _;
    }

    modifier bidIsHidden(uint256 _bid_id) {
        require(
            bids[_bid_id].primary_status == BidStatusPrimary.HIDDEN,
            "This bid cannot be opened"
        );
        _;
    }

    modifier bidIsOpened(uint256 _bid_id) {
        require(
            bids[_bid_id].primary_status == BidStatusPrimary.OPENED,
            "This bid cannot be hidden once opened"
        );
        _;
    }
}
