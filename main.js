require('dotenv').config();
const ethers = require('ethers');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { startServer } = require('./server');
const { TelegramBotIntegration } = require('./telegram');
const Queue = require('bull');
const flashLoanQueue = new Queue('flashLoanQueue');
const { executeFlashLoan } = require('./botLogic');
const cache = require('./cache');

async function getSecureConfig() {
  return {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
    FLASH_LOAN_AMOUNT: process.env.FLASH_LOAN_AMOUNT,
    MONITORING_INTERVAL: parseInt(process.env.MONITORING_INTERVAL),
    PORT: parseInt(process.env.PORT) || 3000,
  };
}

if (cluster.isMaster) {
  let config;
  let telegramBot;
  const workers = new Set();

  const initMaster = async () => {
    config = await getSecureConfig();
    telegramBot = new TelegramBotIntegration(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID);
    await telegramBot.startPolling();

    // Start the server in the master process
    startServer(config, cache);

    // Create initial workers
    for (let i = 0; i < 2; i++) {
      const worker = cluster.fork();
      workers.add(worker);
    }

    // Handle messages from workers
    cluster.on('message', (worker, message) => {
      if (message.type === 'sendTelegramAlert') {
        telegramBot.sendAlert(message.message);
      }
    });

    // Handle worker exits
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died. Restarting...`);
      workers.delete(worker);
      const newWorker = cluster.fork();
      workers.add(newWorker);
    });

    // Monitor and adjust worker count
    setInterval(() => {
      const load = Math.random(); // Example load calculation
      if (load > 0.75 && workers.size < numCPUs) {
        const newWorker = cluster.fork();
        workers.add(newWorker);
        console.log(`Increased workers. Active workers: ${workers.size}`);
      } else if (load < 0.25 && workers.size > 2) {
        const workerToRemove = Array.from(workers)[workers.size - 1];
        workerToRemove.kill();
        workers.delete(workerToRemove);
        console.log(`Reduced workers. Active workers: ${workers.size}`);
      }
    }, 60000);
  };

  initMaster().catch(error => {
    console.error('Error in master process:', error);
    process.exit(1);
  });

} else {
  // Worker process
  const workerMain = async () => {
    const config = await getSecureConfig();

    const addFlashLoanJob = () => {
      flashLoanQueue.add({
        amount: ethers.utils.parseUnits(config.FLASH_LOAN_AMOUNT, 18),
        config,
        cache
      });
    };

    // Initial job
    addFlashLoanJob();

    // Schedule regular jobs
    setInterval(addFlashLoanJob, config.MONITORING_INTERVAL);

    // Process flash loan queue
    flashLoanQueue.process(async (job) => {
      try {
        const result = await executeFlashLoan(job.data);
        if (result.success) {
          process.send({ type: 'sendTelegramAlert', message: `Flash Loan successful: ${result.profit} ETH profit` });
        }
      } catch (error) {
        console.error('Error executing Flash Loan:', error);
        process.send({ type: 'sendTelegramAlert', message: `Flash Loan error: ${error.message}` });
      }
    });
  };

  workerMain().catch(error => {
    console.error('Error in worker process:', error);
    process.exit(1);
  });
}