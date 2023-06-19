// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

contract DutchAuctionVerify {
    function _hashBid(
        bytes32 _symbol,
        uint256 _quantity,
        uint256 _bid_unit_price_eth
    ) internal pure returns (bytes32) {
        // hash data to check verifyer
        bytes32 bid_data_hash = keccak256(
            abi.encode(_symbol, _quantity, _bid_unit_price_eth)
        );
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixed_Hash_Message = keccak256(
            abi.encodePacked(prefix, bid_data_hash)
        );

        return prefixed_Hash_Message;
    }

    function _verifyMessage(
        address _bid_owner,
        bytes32 _prefixed_hash_message,
        bytes memory _signature
    ) internal pure returns (bool) {
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(_signature);

        address signer = ecrecover(_prefixed_hash_message, v, r, s);

        if (signer == _bid_owner) {
            return true;
        }

        return false;
    }

    function _splitSignature(
        bytes memory _signature
    ) private pure returns (uint8, bytes32, bytes32) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(_signature, 32))
            // second 32 bytes
            s := mload(add(_signature, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(_signature, 96)))
        }

        // EIP-2 still allows signature malleability for ecrecover(). Remove this possibility and make the signature unique

        if (v < 27) {
            v += 27;
        }
        return (v, r, s);
    }
}
