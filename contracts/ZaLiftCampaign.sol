// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

contract ZaLiftCampaign is IERC7984Receiver, ZamaEthereumConfig {
    address public immutable creator;
    address public immutable token;

    string public campaignName;
    uint64 public targetAmount;
    uint64 public endTime;
    bool public ended;

    euint64 private _totalRaised;

    mapping(address contributor => euint64) private _contributions;
    mapping(address contributor => euint64) private _points;

    mapping(address contributor => bool) private _isParticipant;
    address[] private _participants;

    event ContributionReceived(address indexed contributor, euint64 amount, euint64 newTotalRaised);
    event CampaignEnded(address indexed creator, euint64 withdrawnAmount);

    error OnlyCreator();
    error AlreadyEnded();
    error CampaignClosed();
    error InvalidTokenCaller(address caller);
    error InvalidEndTime(uint64 endTime);

    constructor(address creator_, address token_, string memory name_, uint64 targetAmount_, uint64 endTime_) {
        require(creator_ != address(0), "creator is zero");
        require(token_ != address(0), "token is zero");
        if (endTime_ <= block.timestamp) revert InvalidEndTime(endTime_);

        creator = creator_;
        token = token_;
        campaignName = name_;
        targetAmount = targetAmount_;
        endTime = endTime_;
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function totalRaised() external view returns (euint64) {
        return _totalRaised;
    }

    function contributionOf(address contributor) external view returns (euint64) {
        return _contributions[contributor];
    }

    function pointsOf(address contributor) external view returns (euint64) {
        return _points[contributor];
    }

    function onConfidentialTransferReceived(
        address, /* operator */
        address from,
        euint64 amount,
        bytes calldata /* data */
    ) external returns (ebool) {
        if (msg.sender != token) revert InvalidTokenCaller(msg.sender);
        if (ended) {
            ebool rejected = FHE.asEbool(false);
            FHE.allowThis(rejected);
            FHE.allow(rejected, msg.sender);
            return rejected;
        }
        if (block.timestamp >= endTime) {
            ebool rejected = FHE.asEbool(false);
            FHE.allowThis(rejected);
            FHE.allow(rejected, msg.sender);
            return rejected;
        }

        if (!_isParticipant[from]) {
            _isParticipant[from] = true;
            _participants.push(from);
        }

        euint64 newContribution = FHE.add(_contributions[from], amount);
        euint64 newPoints = FHE.add(_points[from], amount);
        euint64 newTotalRaised = FHE.add(_totalRaised, amount);

        _contributions[from] = newContribution;
        _points[from] = newPoints;
        _totalRaised = newTotalRaised;

        FHE.allowThis(newContribution);
        FHE.allowThis(newPoints);
        FHE.allowThis(newTotalRaised);

        FHE.allow(newContribution, from);
        FHE.allow(newPoints, from);
        FHE.allow(newTotalRaised, from);
        FHE.allow(newTotalRaised, creator);
        FHE.allow(newTotalRaised, msg.sender);
        FHE.makePubliclyDecryptable(newTotalRaised);

        emit ContributionReceived(from, amount, newTotalRaised);
        ebool accepted = FHE.asEbool(true);
        FHE.allowThis(accepted);
        FHE.allow(accepted, msg.sender);
        return accepted;
    }

    function endAndWithdraw() external {
        if (msg.sender != creator) revert OnlyCreator();
        if (ended) revert AlreadyEnded();

        ended = true;

        IERC7984 tokenContract = IERC7984(token);
        euint64 balance = tokenContract.confidentialBalanceOf(address(this));
        euint64 withdrawn;
        if (FHE.isInitialized(balance)) {
            withdrawn = tokenContract.confidentialTransfer(creator, balance);
        } else {
            withdrawn = FHE.asEuint64(0);
        }

        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, creator);

        emit CampaignEnded(creator, withdrawn);
    }
}
