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
- LaunchFactory: `0x8dAd7176C3E6D24Bf642D887Edb53134C62D996b`
- MetricsLens: `0x2E6A12A581E2c664dBE51e6cacAf8d80075C2454`
- FlowPassNFT: `0x879582E67003a2F330E9A323afCFc3De592B18d2`
- V4Quoter: `0xD1f05e4654321F49A26015678b8fd8795775d10A`
- Launch token: `0x29D2826B97Ec912a54761D0E34E6baF13689f997`
- Quote token: `0x065E67cd83Db2F1E07FA9BE9B68A814Fbe5C4cE6`
- PoolId: `0xb45ba6fc1f31382c0fd1711db9eb81d549a81160936bb3b8fbd575772aaf40cf`
- Non-owner creator: `0xEb550Aec7Ddd71E3353498020A4245a87dd08f54`
- Creator register tx: `0x81b6a661c0ce430ed9ef58c2e96041fc92f0d7254df3c34a0a52ac2830b0b7bf`
- V4Quoter deploy tx: `0x4ad1e7999af768398e76b733e9f7ebf897bd5d67fa370a37cd0f372385e603ad`
- FlowPass mint swap tx: `0x4c336046a7f79ca4161096d322b67f60b63bc891acdcf4a6556c04ebcf4795ef`
- FlowPass tier upgrade tx: `0x97782b358bfa0cc9dde75966bf7e27a9bbdd632827b7f942ae099054cbcd0de8`
- Phase 20 script: `contracts/script/DeployXLayerTestnetPhase20.s.sol`

The current proof pool was registered by a non-owner creator wallet through public LaunchFactory creation mode. It uses a 5-minute launch window that was already expired at registration time, so post-launch FlowPass issuance can be verified immediately. The proof swaps upgraded the deployer wallet to FlowPass Tier 2 and emitted `FairFlowSwap`, `MarketScoreUpdated`, and `FlowPassUpgraded` events. The recorded V4Quoter is deployed against the same self-hosted PoolManager and is used for production-style protected minimum output in the browser.

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

This script reuses the self-hosted PoolManager, PositionManager, SwapRouter, and FairFlowHook; deploys a fresh LaunchFactory, MetricsLens, FlowPassNFT, V4Quoter, and token pair; registers an already-expired 5-minute launch pool; runs proof swaps; and verifies FlowPass Tier 2 plus MetricsLens state. It requires `PRIVATE_KEY` for the owner/operator path. When `PRIVATE_KEY2` is set, that second wallet performs the `LaunchFactory.registerLaunch` call as a non-owner creator; otherwise the owner performs registration. It accepts `PULSEPOOL_TESTNET_*` shared-stack variables and falls back to the matching `VITE_*` frontend addresses.

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
