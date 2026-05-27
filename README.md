# X Layer v4 Fairlaunch Hook

Reputation-aware fair launch market prototype built with Uniswap v4 Hooks on X Layer.

The project combines:

- `FairFlowHook`: dynamic LP fee overrides, launch-window guards, cooldown checks, and market-quality metrics.
- `FlowPassNFT`: soulbound reputation tiers minted or upgraded after healthy swap behavior.
- `LaunchFactory`: pool-specific launch configuration registration.
- `MetricsLens`: read-only dashboard data for frontend and report surfaces.
- `frontend/`: Vite/React dashboard, read-only agent report, event evidence, and guarded X Layer testnet swap UX.

Agent/report features are read-only. They explain already-recorded hook state and events; they do not control fees, pool parameters, or AMM behavior.

## Status

- Contracts, tests, local demo scripts, and X Layer testnet demo flow are implemented.
- X Layer testnet demo uses a self-hosted Uniswap v4 stack because official v4 testnet deployments were not listed when this project was prepared.
- X Layer mainnet preparation is included, but no mainnet deployment is recorded in this public release.
- The code is not audited and should not be treated as production-ready without review, monitoring, and a separate mainnet deployment approval process.

## X Layer Testnet Proof

Recorded self-hosted demo stack on X Layer testnet:

- Chain ID: `1952`
- FairFlowHook: `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0`
- MetricsLens: `0x4a2387e529bce6Cda57B1C1127eDC4bc35a70a59`
- FlowPassNFT: `0xCFC3ba5a5834B223bE4e29eDC90806E03F416B12`
- PoolId: `0xa212f003231c263e421438d11bbf49743598681f58326cd7c7a83f4463085040`
- Demo swap tx: `0x950dbe07fadfb554e169bd0d5b3c82480de3be757631242c3a2b5552fb55f8b9`
- Browser wallet swap tx: `0x2210b8e6d0dc35fd3836a947607b377f8bbddb15cafd0e79ec8c7511ef43aff8`

The demo swap receipts include `FairFlowHook` logs such as `FairFlowSwap` and `MarketScoreUpdated`.
The recorded testnet stack did not include a V4Quoter; deploy `contracts/script/DeployXLayerTestnetQuoter.s.sol`
against the recorded PoolManager and set `VITE_V4_QUOTER_ADDRESS` before using production-style quoted minimum output.

## Contracts

Install Foundry dependencies:

```bash
cd contracts
forge install
```

Build and test:

```bash
cd contracts
forge fmt --check
forge build
forge test -vvv
```

Local demo scripts:

```bash
cd contracts
forge script script/DeployLocal.s.sol
forge script script/CreateDemoPool.s.sol
forge script script/DemoSwaps.s.sol
```

X Layer mainnet dry-run only:

```bash
cd contracts
cp .env.xlayer-mainnet.example .env
forge script script/DeployXLayer.s.sol --rpc-url "$XLAYER_RPC_URL"
```

Do not add `--broadcast` unless the target network, chain ID, official Uniswap v4 addresses, deployer address, gas balance, and spending limits have been manually confirmed.

## Frontend

Install and run:

```bash
pnpm install
cp frontend/.env.example frontend/.env.local
pnpm dev
```

Recorded X Layer testnet demo config:

```bash
cp frontend/.env.xlayer-testnet.example frontend/.env.local
pnpm dev
```

Enable testnet browser wallet swaps only when you intentionally want live testnet writes:

```bash
VITE_PULSEPOOL_ENABLE_WRITES=true
```

For mainnet read-only preparation after deployment:

```bash
cp frontend/.env.xlayer-mainnet.example frontend/.env.local
pnpm dev
```

Keep `VITE_PULSEPOOL_ENABLE_WRITES=false` on mainnet until a separate mainnet browser write path is simulated, reviewed, and receipt-proven.
Swap submission requires a non-zero minimum output. When `VITE_V4_QUOTER_ADDRESS` is configured, the frontend can quote expected output and fill a slippage-protected minimum.

Frontend checks:

```bash
pnpm lint
pnpm build
```

## Safety

- Never commit `.env`, private keys, mnemonics, RPC secrets, or API keys.
- Hook logic is deterministic and does not use external oracles.
- FlowPass discounts do not bypass launch guards.
- Mainnet deployment scripts support dry-run first; broadcast requires explicit human approval.
- Frontend write surfaces are guarded by wallet, chain, config, allowance, receipt, and event-proof checks.
