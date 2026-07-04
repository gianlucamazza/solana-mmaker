# Solana Market Maker Bot

This project is a Solana Market Maker Bot designed to automate trading strategies on the Solana blockchain using the Jupiter swap protocol. It implements a portfolio rebalancing strategy between SOL and SPL tokens (50/50 by default), automatically executing trades to restore the target balance when price fluctuations create imbalances.

## Features

- **Automatic Portfolio Rebalancing**: Maintains a configurable value balance between token pairs (default 50/50)
- **Jupiter Integration**: Uses Jupiter Aggregator for optimal swap execution
- **Price Tolerance**: Rebalances only when the imbalance exceeds a configurable share of the portfolio (default 2%)
- **Slippage Protection**: Default 0.5% (50 bps) maximum slippage
- **Priority Fees**: Includes 200,000 lamport priority fees for faster transaction confirmation
- **BIP39 Wallet Support**: Load keypairs from a file or derive them from a mnemonic
- **Robust Transaction Handling**: Re-broadcasts transactions until confirmed, with expiry tracking and timeouts
- **Fault Tolerance**: A failed RPC/API call skips the cycle instead of crashing the bot
- **Simulation Mode**: Test strategies without executing actual trades (`ENABLE_TRADING=false`)

## Project Structure

```bash
.
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── .env.example                # Template for environment configuration
├── .github
│   └── workflows/ci.yml        # CI: build, lint, test
├── src
│   ├── api
│   │   ├── jupiter.ts          # Jupiter API client with quote and swap functionality
│   │   └── solana.ts           # Solana connection management and mint helpers
│   ├── constants
│   │   └── constants.ts        # Token mint addresses
│   ├── main.ts                 # Entry point and setup
│   ├── strategies
│   │   └── basicMM.ts          # Rebalancing market-making strategy implementation
│   ├── utils
│   │   ├── convert.ts          # Token unit conversion utilities (Decimal-based)
│   │   ├── transactionSender.ts # Robust transaction submission with retry logic
│   │   └── sleep.ts            # Asynchronous sleep utility
│   └── wallet.ts               # Keypair loading from file or mnemonic
└── tests                       # Vitest unit tests
    ├── basicMM.test.ts
    └── convert.test.ts
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
4. Environment Variables: Copy `.env.example` to `.env` and fill in your values:
    ```bash
    cp .env.example .env
    ```

### Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `SOLANA_RPC_ENDPOINT` | yes | Solana RPC endpoint URL |
| `USER_KEYPAIR` | no* | Path to a JSON secret-key file (solana-keygen format) |
| `SOLANA_MNEMONIC` | no* | BIP39 mnemonic to derive the keypair from |
| `ENABLE_TRADING` | no | `true` to execute real swaps; anything else runs in simulation mode |
| `JUPITER_API_BASE_URL` | no | Override the Jupiter API base URL (default: `https://quote-api.jup.ag/v6`) |
| `MM_WAIT_TIME_MS` | no | Milliseconds between rebalance checks (default: `60000`) |
| `MM_SLIPPAGE_BPS` | no | Maximum slippage in basis points (default: `50`) |
| `MM_PRICE_TOLERANCE` | no | Portfolio imbalance fraction required to trigger a rebalance (default: `0.02`) |
| `MM_REBALANCE_PERCENTAGE` | no | Target share of total value held in the first token (default: `0.5`) |
| `MM_MINIMUM_TRADE_AMOUNT` | no | Minimum token amount for a trade to be executed (default: `0.01`) |

\* Keypair resolution order: `USER_KEYPAIR` file → `SOLANA_MNEMONIC` → `~/.config/solana/id.json`. Set at most one of the two variables.

## Running the Bot

To start the market maker bot in development mode:

```bash
npm run dev
```

For production after building:

```bash
npm run build
npm start
```

## Testing and Linting

```bash
npm test       # Vitest unit tests
npm run lint   # ESLint over src and tests
```

## Configuration Options

The strategy parameters can be set through the `MM_*` environment variables above, or programmatically via the `MarketMaker` constructor:

```ts
const marketMaker = new MarketMaker({
    waitTime: 60000,            // ms between rebalance checks
    slippageBps: 50,            // max slippage in basis points
    priceTolerance: 0.02,       // imbalance fraction that triggers a rebalance
    rebalancePercentage: 0.5,   // target share of value in the first token
    minimumTradeAmount: 0.01,   // minimum token amount worth trading
});
```

## Customizing Trading Pairs

To change the traded pair:

1. Add your token mint addresses to `src/constants/constants.ts`
2. Update the token configuration in the `MarketMaker` constructor (`src/strategies/basicMM.ts`); SPL token decimals are verified on-chain at startup
3. Ensure you have balances of both tokens in your wallet

## Safety and Security

- Always review the strategy and start with small amounts for testing
- Use a dedicated wallet with only the tokens you intend to trade
- The bot uses priority fees to ensure transactions confirm quickly
- All sensitive information is stored in environment variables; keys and mnemonics are never logged
- Transaction timeout protection prevents hanging on failed transactions

## Contribution
Contributions are welcome! Please feel free to fork the repository, make changes, and submit pull requests.

## Disclaimer
This project is for educational and experimental purposes only. Use it at your own risk. The authors are not responsible for any financial losses or damages.
