const FlashLoan = artifacts.require("FlashLoan");

module.exports = function(deployer) {
  deployer.deploy(FlashLoan);
};
