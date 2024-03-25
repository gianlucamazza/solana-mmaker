# Solana Market Maker Bot

This project is a Solana Market Maker Bot designed to automate trading strategies on the Solana blockchain using the Jupiter swap protocol. It aims to maintain a balanced portfolio across specified token pairs by executing trades based on predefined strategies and market conditions.

## Project Structure

The project is structured as follows:

```bash
.
├── package.json
├── package-lock.json
├── src
│   ├── api
│   │   ├── jupiter.ts          # Jupiter API client
│   │   └── solana.ts           # Solana blockchain interaction utilities
│   ├── constants
│   │   └── constants.ts        # Project-wide constants (e.g., token addresses)
│   ├── main.ts                # Entry point of the application
│   ├── strategies
│   │   └── basicMM.ts          # Basic market-making strategy implementation
│   ├── utils
│   │   ├── convert.ts          # Utility functions for token unit conversions
│   │   ├── getSignature.ts     # Utility for transaction signature handling
│   │   └── sleep.ts            # Asynchronous sleep utility
│   └── wallet.ts               # Wallet and keypair management utilities
└── tsconfig.json
```

## Requirements

- Node.js (version 18.x or later)
- A funded Solana wallet

## Setup

1. Install Node.js: Ensure that you have Node.js (version 14.x or later) installed on your machine. You can download it from [here]("https://nodejs.org/")
2. Clone the Repository: Clone the repository to your local machine using the following command:
    ```bash
    git clone https://github.com/gianlucamazza/solana-mmaker.git
    cd solana-market-maker-bot
    ```
3. Install Dependencies: Install the necessary Node.js dependencies by running:
    ```bash
    npm install
    ```
4. Environment Variables: Set up your environment variables by creating a .env file in the project root with the following content:
    ```
    SOLANA_RPC_ENDPOINT=<Your Solana RPC endpoint URL>
    USER_KEYPAIR=<Path to your Solana wallet keypair file>
    ENABLE_TRADING=<true or false>
    ```
    Replace `<Your Solana RPC endpoint URL>` with your Solana RPC endpoint, `<Path to your Solana wallet keypair file>` with the path to your Solana wallet keypair file, and set ENABLE_TRADING to true to enable live trading or false to run in simulation mode.

## Running the Bot

To start the market maker bot, execute the following command in the terminal:

```bash
npm start
```

This will initiate the market-making strategy defined in src/strategies/basicMM.ts, using the Jupiter protocol for swap transactions.

## Strategy Configuration

The market-making strategy can be customized in `src/strategies/basicMM.ts`. You can define which token pairs to trade, set tolerance levels, rebalance percentages, and more within this file.

## Safety and Security

- Always review the code and understand the strategy before enabling live trading.
- Start with small amounts to test the bot's performance and behavior.
- Keep your Solana wallet keypair file secure and never share it with anyone.

## Contribution
Contributions to the project are welcome! Please feel free to fork the repository, make changes, and submit pull requests.

## Disclaimer
This project is for educational and experimental purposes only. Use it at your own risk. The authors are not responsible for any financial losses or damages