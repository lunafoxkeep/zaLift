// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ZaLiftCampaign} from "./ZaLiftCampaign.sol";

contract ZaLiftFactory {
    address public immutable token;

    address[] private _campaigns;
    mapping(address creator => address[]) private _campaignsByCreator;

    event CampaignCreated(address indexed creator, address indexed campaign, string name, uint64 targetAmount, uint64 endTime);

    constructor(address token_) {
        require(token_ != address(0), "token is zero");
        token = token_;
    }

    function createCampaign(string calldata name, uint64 targetAmount, uint64 endTime) external returns (address campaign) {
        ZaLiftCampaign instance = new ZaLiftCampaign(msg.sender, token, name, targetAmount, endTime);
        campaign = address(instance);

        _campaigns.push(campaign);
        _campaignsByCreator[msg.sender].push(campaign);

        emit CampaignCreated(msg.sender, campaign, name, targetAmount, endTime);
    }

    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function campaignAt(uint256 index) external view returns (address) {
        return _campaigns[index];
    }

    function campaignCountByCreator(address creator) external view returns (uint256) {
        return _campaignsByCreator[creator].length;
    }

    function campaignByCreatorAt(address creator, uint256 index) external view returns (address) {
        return _campaignsByCreator[creator][index];
    }
}

