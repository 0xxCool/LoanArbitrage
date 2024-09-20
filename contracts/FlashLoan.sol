// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ILendingPool.sol";
import "./ILendingPoolAddressesProvider.sol";
import "./IUniswapV2Router02.sol";

contract OptimizedFlashLoanArbitrage is Ownable {
    ILendingPoolAddressesProvider public provider;
    
    // DEX Routers
    IUniswapV2Router02 public pancakeswapRouter;
    IUniswapV2Router02 public bakeryswapRouter;
    IUniswapV2Router02 public apeswapRouter;
    IUniswapV2Router02 public biswapRouter;

    // Token addresses
    address public constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    address public constant BUSD = 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56;
    address public constant USDT = 0x55d398326f99059fF775485246999027B3197955;

    // Flash loan amount
    uint256 public flashLoanAmount;

    constructor(
        address initialOwner,
        address _provider,
        address _pancakeswapRouter,
        address _bakeryswapRouter,
        address _apeswapRouter,
        address _biswapRouter,
        uint256 _flashLoanAmount
    ) Ownable(initialOwner) {
        provider = ILendingPoolAddressesProvider(_provider);
        pancakeswapRouter = IUniswapV2Router02(_pancakeswapRouter);
        bakeryswapRouter = IUniswapV2Router02(_bakeryswapRouter);
        apeswapRouter = IUniswapV2Router02(_apeswapRouter);
        biswapRouter = IUniswapV2Router02(_biswapRouter);
        flashLoanAmount = _flashLoanAmount;
    }

    function executeFlashLoan(address asset) external onlyOwner {
        address lendingPool = provider.getLendingPool();
        address[] memory assets = new address[](1);
        assets[0] = asset;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = flashLoanAmount;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // 0 = no debt, 1 = stable, 2 = variable
        address onBehalfOf = address(this);
        bytes memory params = "";
        uint16 referralCode = 0;

        ILendingPool(lendingPool).flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata // params (removed the parameter name)
    ) external returns (bool) {
        require(msg.sender == provider.getLendingPool(), "Callback only allowed from LendingPool");
        require(initiator == address(this), "FlashLoan not initiated by this contract");

        return performArbitrage(assets[0], amounts[0], premiums[0]);
    }

    function performArbitrage(address tokenIn, uint256 amountIn, uint256 premium) internal returns (bool) {
        (IUniswapV2Router02 buyRouter, IUniswapV2Router02 sellRouter, address tokenOut) = findBestArbitrageOpportunity(tokenIn, amountIn);

        // Execute arbitrage
        IERC20(tokenIn).approve(address(buyRouter), amountIn);
        uint256 amountOut = executeSwap(buyRouter, tokenIn, tokenOut, amountIn);
        IERC20(tokenOut).approve(address(sellRouter), amountOut);
        uint256 finalAmount = executeSwap(sellRouter, tokenOut, tokenIn, amountOut);

        // Repay flash loan
        uint256 totalDebt = amountIn + premium;
        require(finalAmount >= totalDebt, "Arbitrage did not yield enough profit");
        IERC20(tokenIn).transfer(msg.sender, totalDebt);

        return true;
    }

    function findBestArbitrageOpportunity(address tokenIn, uint256 amountIn) internal view returns (IUniswapV2Router02 buyRouter, IUniswapV2Router02 sellRouter, address tokenOut) {
        IUniswapV2Router02[4] memory routers = [pancakeswapRouter, bakeryswapRouter, apeswapRouter, biswapRouter];
        address[2] memory tokenOuts = [BUSD, USDT];
        
        uint256 bestProfit = 0;
        
        for (uint i = 0; i < routers.length; i++) {
            for (uint j = 0; j < routers.length; j++) {
                if (i != j) {
                    for (uint k = 0; k < tokenOuts.length; k++) {
                        uint256 buyAmount = getAmountOut(routers[i], tokenIn, tokenOuts[k], amountIn);
                        uint256 sellAmount = getAmountOut(routers[j], tokenOuts[k], tokenIn, buyAmount);
                        
                        if (sellAmount > bestProfit) {
                            bestProfit = sellAmount;
                            buyRouter = routers[i];
                            sellRouter = routers[j];
                            tokenOut = tokenOuts[k];
                        }
                    }
                }
            }
        }
        
        require(bestProfit > amountIn, "No profitable arbitrage opportunity found");
    }

    function getAmountOut(IUniswapV2Router02 router, address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        return amounts[1];
    }

    function executeSwap(IUniswapV2Router02 router, address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = router.swapExactTokensForTokens(
            amountIn,
            0,
            path,
            address(this),
            block.timestamp
        );
        return amounts[1];
    }

    function setFlashLoanAmount(uint256 _newAmount) external onlyOwner {
        flashLoanAmount = _newAmount;
    }

    function withdrawToken(address _token) external onlyOwner {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).transfer(owner(), balance);
    }

    function withdrawBNB() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    receive() external payable {}
}