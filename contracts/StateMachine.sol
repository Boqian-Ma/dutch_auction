// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "../node_modules/@openzeppelin/contracts/access/Ownable.sol";

contract StateMachine is Ownable {
    enum Stages {
        DEPOSIT_WITHDRAW,
        ACCEPTING_OFFERS,
        ACCEPTING_BIDS,
        MATCHING
    }

    /**
     * @notice  Used to check for state update.
     */
    function probeStage() public timedTransitions {}

    function godModeSetStage(Stages _stage) public onlyOwner {
        // used for testing
        stage = _stage;
    }

    uint8 num_stages = 4;
    Stages public stage;
    uint256 public lastModifiedTime;

    constructor() {
        lastModifiedTime = block.timestamp;
        // set current state
        stage = Stages.DEPOSIT_WITHDRAW;
    }

    modifier atStage(Stages _stage) {
        require(
            stage == _stage,
            "This operation is not allowed to be performed at this stage"
        );
        _;
    }

    function nextStage() private {
        // update last modified time
        lastModifiedTime = block.timestamp;
        stage = Stages((uint(stage) + 1) % num_stages); // 4 stages totaly, will continue rotating
    }

    // Perform timed transitions. Be sure to mention
    // this modifier first, otherwise the guards
    // will not take the new stage into account.
    modifier timedTransitions() {
        if (block.timestamp >= lastModifiedTime + 5 minutes) nextStage();
        _;
    }

    // This modifier goes to the next stage
    // after the function is done.
    // In Dutch auction, used after matching is done
    modifier transitionNext() {
        _;
        nextStage();
    }
}
