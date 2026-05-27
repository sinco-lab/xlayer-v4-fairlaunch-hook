# FairFlow Launch

FairFlow Launch is a fair-launch pool layer for Uniswap v4 on X Layer. It gives token teams a launch surface where early trading is governed by deterministic hook rules, adaptive fees, FlowPass reputation, and visible onchain evidence instead of opaque launch claims.

## What It Does

- `FairFlowHook`: applies launch-window guardrails, cooldown checks, dynamic LP fee overrides, market-quality scoring, and FlowPass-aware fee discounts.
- `FlowPassNFT`: soulbound reputation NFT with 4 tiers, onchain JSON metadata, and IPFS image assets for each tier.
- `LaunchFactory`: registers pool-specific launch configuration into the hook.
- `MetricsLens`: exposes read-only launch state for the frontend and report surface.
- `frontend/`: FairFlow Launch product UI with Launch Proof, Fair Swap, Launch Console preview, FlowPass proof, and deterministic FairFlow Report.

The report surface is read-only. It explains already-recorded hook state and events; it does not control fees, pool parameters, wallet actions, or AMM behavior.

## Status

- Contracts, tests, local scripts, X Layer testnet deployment scripts, and guarded browser swap UX are implemented.
- X Layer testnet uses a self-hosted Uniswap v4 demo stack deployed by this project, because official X Layer testnet v4 deployments were not listed when the demo was prepared.
- X Layer mainnet preparation is included, but no mainnet deployment is recorded in this public release.
- The code is not audited and should not be treated as production-ready without review, monitoring, and a separate mainnet deployment approval process.

## X Layer Testnet Proof

Recorded self-hosted demo stack on X Layer testnet:

- Chain ID: `1952`
- FairFlowHook: `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0`
- MetricsLens: `0x4a2387e529bce6Cda57B1C1127eDC4bc35a70a59`
- FlowPassNFT: `0xB034a550B14Cbbad1867Fc31fA7fFd68eD4aCb09`
- V4Quoter: `0xFC69E07e2a219F51cE347e44f56F28240b9aD3de`
- PoolId: `0x39f8af0ce3467991650194eb86aaabcea54a885b0900261d6b67bfa30c6d9e7f`
- V4Quoter deploy tx: `0x0fcb8f540621f93a8a9d80dc764e2efcdc8af458048883234681dbb1e176c57d`
- FlowPass mint swap tx: `0xb298b345c50bf5fe5468ccc26e535d61f34b42a3fb60943cfc297fdd2c2925e8`
- FlowPass tier upgrade tx: `0x281ca5a7f859102220bd38dabde8fd7579565135764e7c4dc2bb8bf874400dd0`

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

Keep `VITE_PULSEPOOL_ENABLE_WRITES=false` on mainnet until a separate mainnet browser write path is simulated, reviewed, and receipt-proven. Swap submission requires a non-zero minimum output. When `VITE_V4_QUOTER_ADDRESS` is configured, the frontend can quote expected output and fill a slippage-protected minimum.

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
