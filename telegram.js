const TelegramBot = require('node-telegram-bot-api');

class TelegramBotIntegration {
  constructor(token, chatId) {
    if (!token) {
      throw new Error('Telegram token is not defined');
    }
    if (!chatId) {
      throw new Error('Telegram chat ID is not defined');
    }

    this.token = token;
    this.chatId = chatId;
    this.bot = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  async startPolling() {
    if (this.bot) {
      await this.stopPolling();
    }

    return new Promise((resolve, reject) => {
      console.log('Starting bot polling...');
      this.bot = new TelegramBot(this.token, { polling: true, cancelPendingOnDisconnect: true });

      const timeout = setTimeout(() => {
        reject(new Error('Bot initialization timed out'));
      }, 30000); // 30 seconds timeout

      this.bot.on('polling_error', (error) => {
        console.error('Polling error:', error);
        this.handlePollingError(error);
      });

      this.bot.on('error', (error) => {
        console.error('Bot error:', error);
        this.handlePollingError(error);
      });

      this.bot.once('start_polling', () => {
        clearTimeout(timeout);
        console.log('Bot polling started successfully');
        this.reconnectAttempts = 0;
        resolve();
      });
    });
  }

  async stopPolling() {
    if (this.bot) {
      try {
        await this.bot.stopPolling();
        console.log('Polling stopped');
      } catch (error) {
        console.error('Error stopping polling:', error);
      } finally {
        this.bot = null;
      }
    }
  }

  async handlePollingError(error) {
    await this.stopPolling();
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
      setTimeout(() => this.startPolling(), delay);
    } else {
      console.error('Max reconnection attempts reached. Please check your bot configuration.');
    }
  }

  async sendAlert(message) {
    if (!this.bot) {
      console.error('Bot is not initialized. Starting polling...');
      await this.startPolling();
    }

    try {
      await this.bot.sendMessage(this.chatId, message);
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
      this.handlePollingError(error);
    }
  }
}

module.exports = { TelegramBotIntegration };