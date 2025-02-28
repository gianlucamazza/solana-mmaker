# Solana Market Maker Bot

This project is a Solana Market Maker Bot designed to automate trading strategies on the Solana blockchain using the Jupiter swap protocol. It implements a 50/50 portfolio rebalancing strategy between SOL and SPL tokens, automatically executing trades to maintain balance when price fluctuations create imbalances.

## Features

- **Automatic Portfolio Rebalancing**: Maintains a 50/50 value balance between token pairs
- **Jupiter Integration**: Uses Jupiter Aggregator for optimal swap execution
- **Price Tolerance**: Default 2% tolerance before triggering rebalance
- **Slippage Protection**: Default 0.5% (50 bps) maximum slippage
- **Priority Fees**: Includes 200,000 lamport priority fees for faster transaction confirmation
- **BIP39 Wallet Support**: Generate keypairs from mnemonics or load from file
- **Robust Transaction Handling**: Includes retry logic and confirmation timeouts
- **Simulation Mode**: Test strategies without executing actual trades

## Project Structure

```bash
.
├── package.json
├── package-lock.json
├── src
│   ├── api
│   │   ├── jupiter.ts          # Jupiter API client with quote and swap functionality
│   │   └── solana.ts           # Solana connection management
│   ├── constants
│   │   └── constants.ts        # Token addresses and network configuration
│   ├── main.ts                 # Entry point and setup
│   ├── strategies
│   │   └── basicMM.ts          # 50/50 market-making strategy implementation
│   ├── utils
│   │   ├── convert.ts          # Token unit conversion utilities
│   │   ├── getSignature.ts     # Transaction signature handling
│   │   ├── transactionSender.ts # Robust transaction submission with retry logic
│   │   └── sleep.ts            # Asynchronous sleep utility
│   └── wallet.ts               # Keypair loading from file or mnemonic
└── tsconfig.json
```

## Requirements

- Node.js (version 18.x or later)
- A funded Solana wallet with SOL and SPL tokens

## Setup

1. Install Node.js: Ensure that you have Node.js installed on your machine. You can download it from [here](https://nodejs.org/)
2. Clone the Repository: Clone the repository to your local machine:
    ```bash
    git clone https://github.com/gianlucamazza/solana-mmaker.git
    cd solana-mmaker
    ```
3. Install Dependencies:
    ```bash
    npm install
    ```
4. Environment Variables: Create a `.env` file in the project root:
    ```
    SOLANA_RPC_ENDPOINT=<Your Solana RPC endpoint URL>
    ENABLE_TRADING=<true or false>
    SOLANA_MNEMONIC=<Your bip39 compatible mnemonic>
    CLUSTER=<mainnet-beta or devnet>
    ```
    For wallet configuration, either:
    - Provide your BIP39 mnemonic in the `SOLANA_MNEMONIC` environment variable, or
    - The bot will automatically use the Solana keypair at `~/.config/solana/id.json` if available
    
    The `CLUSTER` is optional and defaults to "mainnet-beta".

## Running the Bot

First, create a `.env` file with the required environment variables:

```bash
# Example .env file
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
ENABLE_TRADING=false
SOLANA_MNEMONIC=your-mnemonic-phrase-here
CLUSTER=mainnet-beta
```

To start the market maker bot in development mode:

```bash
npm run dev
```

For production after building:

```bash
npm run build
npm start
```

## Configuration Options

The following parameters can be adjusted in the `MarketMaker` class constructor:

- `waitTime`: Time between rebalance checks (default: 60000ms)
- `slippageBps`: Maximum slippage tolerance in basis points (default: 50 bps or 0.5%)
- `priceTolerance`: Threshold for triggering rebalance (default: 0.02 or 2%)
- `rebalancePercentage`: Target portfolio balance ratio (default: 0.5 or 50/50)
- `minimumTradeAmount`: Minimum amount to trade (default: 0.01 tokens)

## Customizing Trading Pairs

The bot is designed to work with any SPL token pair. To modify the trading pairs:

1. Add your token mint addresses to the `constants.ts` file
2. Update the token configuration in the `MarketMaker` constructor
3. Ensure you have balances of both tokens in your wallet

## Safety and Security

- Always review the strategy and start with small amounts for testing
- Use a dedicated wallet with only the tokens you intend to trade
- The bot uses priority fees to ensure transactions confirm quickly
- All sensitive information is stored in environment variables
- Transaction timeout protection prevents hanging on failed transactions

## Contribution
Contributions are welcome! Please feel free to fork the repository, make changes, and submit pull requests.

## Disclaimer
This project is for educational and experimental purposes only. Use it at your own risk. The authors are not responsible for any financial losses or damages.