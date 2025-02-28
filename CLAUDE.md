# CLAUDE.md - Solana Market Maker Bot

## Build Commands
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled bot (production)
- `npm run dev` - Run the bot with ts-node (development)

## Project Structure
- `/src` - Source code
  - `/api` - External API integrations (Jupiter, Solana)
  - `/constants` - Project-wide constants
  - `/strategies` - Trading strategies
  - `/utils` - Helper functions
  - `main.ts` - Entry point
  - `wallet.ts` - Wallet management

## Code Style Guidelines
- **Types**: Use strict typing (`strict: true` in tsconfig)
- **Naming**: Use camelCase for files and variables
- **Imports**: Group imports by external libraries first, then internal modules
- **Error Handling**: Use try/catch blocks for API calls and transactions
- **Environment**: Store sensitive data in `.env` file (never commit)
- **Documentation**: Add JSDoc comments for functions with complex logic
- **Async**: Use async/await pattern for asynchronous operations
- **Constants**: Define token addresses and config values in constants directory

## Dependencies
- Solana web3.js v1.90.0
- Jupiter API v6
- SPL Token v0.1.8
- TypeScript and Node.js (v18+)