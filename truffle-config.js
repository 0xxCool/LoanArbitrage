const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();

module.exports = {
  networks: {
    bsc: {
      provider: () => new HDWalletProvider(process.env.PRIVATE_KEY, process.env.RPC_URL),
      network_id: 56,
      gas: 2000000,
      gasPrice: 20000000000, // 20 Gwei
      confirmations: 10,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },
  compilers: {
    solc: {
      version: "0.8.0",
    }
  }
};
