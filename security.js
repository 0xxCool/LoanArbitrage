const ethers = require('ethers');
const logger = require('./logger');

const monitorGasPrice = async (provider, maxGasPrice) => {
  const gasPrices = [];
  const recordGasPrice = async () => {
    const gasPrice = await provider.getGasPrice();
    gasPrices.push(gasPrice);
    if (gasPrices.length > 10) gasPrices.shift(); // Nur die letzten 10 Einträge behalten
  };

  setInterval(recordGasPrice, 6000); // Alle 6 Sekunden den Gaspreis überwachen
  
  const averageGasPrice = gasPrices.reduce((acc, price) => acc.add(price), ethers.BigNumber.from(0)).div(gasPrices.length);
  if (averageGasPrice.gt(ethers.utils.parseUnits(maxGasPrice, 'gwei'))) {
    throw new Error('Durchschnittlicher Gaspreis zu hoch');
  }
  return averageGasPrice;
};

const rateLimiter = (fn, limit) => {
  let lastRun = 0;
  let limitHits = 0;
  
  return async function(...args) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      lastRun = now;
      return fn.apply(this, args);
    } else {
      limitHits++;
      logger.info(`Rate limit erreicht. Warten: ${limit - (now - lastRun)}ms. Limit-Hits: ${limitHits}`);
      await new Promise(resolve => setTimeout(resolve, limit - (now - lastRun)));
      return rateLimiter(fn, limit).apply(this, args);
    }
  };
};

module.exports = { monitorGasPrice, rateLimiter };
