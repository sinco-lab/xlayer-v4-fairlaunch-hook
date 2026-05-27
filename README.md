# FairFlow Launch

FairFlow Launch is a fair-launch pool layer for Uniswap v4 on X Layer. It gives token teams a launch surface where early trading is governed by deterministic hook rules, adaptive fees, FlowPass reputation, and visible onchain evidence instead of opaque launch claims.

## What It Does

- `FairFlowHook`: applies launch-window guardrails, cooldown checks, dynamic LP fee overrides, market-quality scoring, and FlowPass-aware fee discounts.
- `FlowPassNFT`: soulbound reputation NFT with 4 tiers, onchain JSON metadata, and IPFS image assets for each tier.
- `LaunchFactory`: registers pool-specific launch configuration into the hook with owner, allowlist, public-mode, pause, and creation-fee controls.
- `MetricsLens`: exposes read-only launch state for the frontend and report surface.
- `frontend/`: FairFlow Launch product UI with Launch Proof, Fair Swap, owner/operator Launch Console, FlowPass proof, and deterministic FairFlow Report.

The report surface is read-only. It explains already-recorded hook state and events; it does not control fees, pool parameters, wallet actions, or AMM behavior.

## Status

- Contracts, tests, local scripts, X Layer testnet deployment scripts, and guarded browser swap UX are implemented.
- X Layer testnet uses a self-hosted Uniswap v4 demo stack deployed by this project, because official X Layer testnet v4 deployments were not listed when the demo was prepared.
- X Layer mainnet preparation is included, but no mainnet deployment is recorded in this public release.
- The code is not audited and should not be treated as production-ready without review, monitoring, and a separate mainnet deployment approval process.

## X Layer Testnet Proof

Recorded self-hosted demo stack on X Layer testnet:

- Chain ID: `1952`
- PoolManager: `0xF0B851d2C292d4Bae654De7D8A53C7fA6DAc6Ec0`
- PositionManager: `0xdD821831A0002447c5FcA329E898a286B99FD6f9`
- SwapRouter: `0x16B3c4629FB0D61BaD533f6442ac96fE35Db76e0`
- FairFlowHook: `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0`
- LaunchFactory: `0xd838B10CD8716a03f00A5a615637025D256eDA0C`
- MetricsLens: `0xE23AC940aA00B27221853CE9de97b79E85dBF486`
- FlowPassNFT: `0x2E3ec81076AD83b8Fab1fD772A503C2289f330A2`
- V4Quoter: `0x7189638A605c6e75817dC27963aaA2bed8b7bFab`
- Launch token: `0x77F118F50e03e0Ef98936034f8347A302a407100`
- Quote token: `0x5C445c73482f58eaf377458621f316931ED1364e`
- PoolId: `0x4057c13edf2bafd5966eb6119741e9dd15b9f078ea3fe71926b01eebe7f89a73`
- V4Quoter deploy tx: `0xa77865d372ce4fedf4c592ff8bd55752c62df19ac30ddf58b86bc850e40ce34f`
- FlowPass mint swap tx: `0x897717619fbf3edbf523c155a63497f4fdb74845e1e89ecea68d49bfb73212e7`
- FlowPass tier upgrade tx: `0x8c602203a93f6d2501275c7fe40ae29ee6e3add7fa82fd41a827ed2a0f3bf5ea`
- Phase 20 script: `contracts/script/DeployXLayerTestnetPhase20.s.sol`

The current proof pool uses a 5-minute launch window that was already expired at registration time, so post-launch FlowPass issuance can be verified immediately. The proof swaps upgraded the deployer wallet to FlowPass Tier 2 and emitted `FairFlowSwap`, `MarketScoreUpdated`, and `FlowPassUpgraded` events. The recorded V4Quoter is deployed against the same self-hosted PoolManager and is used for production-style protected minimum output in the browser.

## FlowPass Assets

The current FlowPassNFT deployment uses onchain JSON metadata with image fields pointing to the pinned IPFS assets:

- Tier 1: `ipfs://bafybeibdkwlmm3zekqtaqog3ldx2vd2hukyfde52muuc2qpjbrxnkssv34`
- Tier 2: `ipfs://bafybeibdsa6zr3ggekgs2b5icwabo2sqohwh6laqjfhiexkyzu3kfrw27q`
- Tier 3: `ipfs://bafybeicpv6u4coalfvggg6uusxg54zdwh5f5ltyh2hftx7avg3ltijua3i`
- Tier 4: `ipfs://bafybeibz5llct6lce4vge4q2wwc5ku2o33z4eastdtjcecntch5umagqlu`

Token `1` on the current testnet FlowPassNFT resolves to Tier 2 metadata after the proof swaps.

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

X Layer testnet initial liquidity operator path:

```bash
cd contracts
forge script script/SeedXLayerTestnetLiquidity.s.sol --rpc-url "$XLAYER_TESTNET_RPC_URL"
forge script script/SeedXLayerTestnetLiquidity.s.sol --rpc-url "$XLAYER_TESTNET_RPC_URL" --broadcast
```

Use the first command as a simulation. Broadcast only after `PULSEPOOL_TESTNET_POOL_MANAGER`, `PULSEPOOL_TESTNET_POSITION_MANAGER`, `PULSEPOOL_TESTNET_POOL_ID`, token addresses, liquidity amounts, operator wallet, and gas budget are confirmed in the local `.env`.

X Layer testnet Phase 20 shared-stack proof:

```bash
cd contracts
forge script script/DeployXLayerTestnetPhase20.s.sol --rpc-url "$XLAYER_TESTNET_RPC_URL"
forge script script/DeployXLayerTestnetPhase20.s.sol --rpc-url "$XLAYER_TESTNET_RPC_URL" --broadcast
```

This script reuses the self-hosted PoolManager, PositionManager, SwapRouter, and FairFlowHook; deploys a fresh LaunchFactory, MetricsLens, FlowPassNFT, V4Quoter, and token pair; registers an already-expired 5-minute launch pool; runs proof swaps; and verifies FlowPass Tier 2 plus MetricsLens state. It accepts `PULSEPOOL_TESTNET_*` shared-stack variables and falls back to the matching `VITE_*` frontend addresses.

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

Enable testnet browser wallet writes only when you intentionally want live testnet transactions:

```bash
VITE_PULSEPOOL_ENABLE_WRITES=true
```

For mainnet read-only preparation after deployment:

```bash
cp frontend/.env.xlayer-mainnet.example frontend/.env.local
pnpm dev
```

Keep `VITE_PULSEPOOL_ENABLE_WRITES=false` on mainnet until each mainnet browser write path is simulated, reviewed, and receipt-proven. Swap submission requires a non-zero minimum output. When `VITE_V4_QUOTER_ADDRESS` is configured, the frontend can quote expected output and fill a slippage-protected minimum.

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
