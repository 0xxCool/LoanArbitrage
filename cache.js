const NodeCache = require('node-cache');
const axios = require('axios');
const logger = require('./logger');

const cache = new NodeCache();

const getBNBPrice = async () => {
  const cachedPrice = cache.get('bnbPrice');
  if (cachedPrice) return cachedPrice;

  try {
    const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT');
    const price = parseFloat(response.data.price);
    cache.set('bnbPrice', price, 30); // Cache für 30 Sekunden
    return price;
  } catch (error) {
    logger.error("Fehler beim Abrufen des BNB-Preises:", error);
    return 0;
  }
};

module.exports = { cache, getBNBPrice };
