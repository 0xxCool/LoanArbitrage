const express = require('express');
const app = express();

function startServer(config, cache) {
  app.get('/', (req, res) => {
    res.send('Flash Loan Bot is running!');
  });

  const PORT = config.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

function getSecureConfig() {
  return {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    FLASH_LOAN_AMOUNT: process.env.FLASH_LOAN_AMOUNT,
    MONITORING_INTERVAL: process.env.MONITORING_INTERVAL || 60000,
    PORT: process.env.PORT || 3000,
  };
}

module.exports = {
  startServer,
  getSecureConfig,
};
