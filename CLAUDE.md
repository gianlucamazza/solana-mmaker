# CLAUDE.md - Solana Market Maker Bot

## Build Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled bot (production)
- `npm run dev` - Run the bot with ts-node (development)
- `npm test` - Run unit tests (Vitest)
- `npm run lint` - Lint src and tests (ESLint)

## Project Structure

- `/src` - Source code
  - `/api` - External API integrations (Jupiter, Solana)
  - `/constants` - Project-wide constants
  - `/strategies` - Trading strategies
  - `/utils` - Helper functions
  - `main.ts` - Entry point
  - `wallet.ts` - Wallet management
- `/tests` - Vitest unit tests
- `.env.example` - Template for environment configuration
- `.github/workflows` - CI (build, lint, test)

## Code Style Guidelines

- **Types**: Use strict typing (`strict: true` in tsconfig); avoid `any`
- **Naming**: Use camelCase for files and variables
- **Imports**: Group imports by external libraries first, then internal modules
- **Error Handling**: Use try/catch blocks for API calls and transactions; never let one failed cycle crash the bot loop
- **Environment**: Store sensitive data in `.env` file (never commit); never log keys, seeds, or mnemonics
- **Documentation**: Add JSDoc comments for functions with complex logic
- **Async**: Use async/await pattern for asynchronous operations
- **Constants**: Define token mint addresses in `src/constants/`; tunable defaults live next to their use (e.g. Jupiter base URL in `src/api/jupiter.ts`, transaction timing in `src/utils/transactionSender.ts`) and are overridable via `MM_*` environment variables read in `src/main.ts`
- **Amount math**: Use `decimal.js` (see `src/utils/convert.ts`) for token amounts, never float arithmetic

## Dependencies

- Solana web3.js and SPL Token
- Jupiter Aggregator HTTP API (v6)
- TypeScript and Node.js (v18+)
- Vitest for testing, ESLint (typescript-eslint) for linting
