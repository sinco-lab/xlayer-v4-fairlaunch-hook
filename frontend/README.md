# FairFlow Launch Frontend

Vite/React product surface for FairFlow Launch: Launch Proof, Fair Swap, FlowPass evidence, Launch Console preview, and deterministic FairFlow Report.

## Setup

```bash
pnpm install
cp frontend/.env.example frontend/.env.local
pnpm dev
```

## Configuration

Live reads require:

- `VITE_METRICS_LENS_ADDRESS`
- `VITE_FAIRFLOW_HOOK_ADDRESS`
- `VITE_POOL_ID`

Optional values:

- `VITE_LAUNCH_FACTORY_ADDRESS`
- `VITE_SWAP_ROUTER_ADDRESS`
- `VITE_V4_QUOTER_ADDRESS`
- `VITE_FLOW_PASS_NFT_ADDRESS`
- `VITE_LAUNCH_TOKEN_ADDRESS`
- `VITE_QUOTE_TOKEN_ADDRESS`
- `VITE_DEMO_SWAP_TX_HASH`

Live write flows also require:

- `VITE_PULSEPOOL_ENABLE_WRITES=true`
- `VITE_POOL_MANAGER_ADDRESS`
- `VITE_SWAP_ROUTER_ADDRESS`
- `VITE_LAUNCH_TOKEN_ADDRESS`
- `VITE_QUOTE_TOKEN_ADDRESS`
- `VITE_LAUNCH_TOKEN_SYMBOL`
- `VITE_QUOTE_TOKEN_SYMBOL`
- `VITE_TOKEN_DECIMALS`
- `VITE_POOL_FEE`
- `VITE_POOL_TICK_SPACING`
- `VITE_SWAP_DEADLINE_SECONDS`

The `VITE_PULSEPOOL_*` prefix is kept for compatibility with the existing deployment config. Product copy now presents the app as FairFlow Launch.

When required values are missing, the UI shows a configuration state. Mock or preview-only surfaces are explicitly labeled.

## Write Flow

The frontend keeps read-only and write surfaces separate:

- `Launch Proof` reads MetricsLens state and FairFlowHook events.
- `FairFlow Report` generates deterministic, read-only narrative from loaded state.
- `Fair Swap` can send live testnet transactions when write config and wallet guards pass.
- `Launch Console` remains a guided preview until pool initialization, launch registration, and liquidity setup are browser-ready end to end.

To enable browser wallet swaps:

```bash
cp frontend/.env.xlayer-testnet.example frontend/.env.local
```

Then set:

```bash
VITE_PULSEPOOL_ENABLE_WRITES=true
```

After `pnpm dev`, connect a wallet on X Layer testnet, open `Fair Swap`, approve the input token when required, use the V4 Quoter protected minimum, and submit the swap. Successful swaps show the tx hash, explorer link, receipt proof, and refreshed proof/report state.

`Fair Swap` requires a non-zero minimum output before sending a transaction. If `VITE_V4_QUOTER_ADDRESS` is configured, the page quotes expected output through V4Quoter and can fill a slippage-protected minimum; otherwise the user must enter a minimum output manually.

For the recorded X Layer mainnet proof pool:

```bash
cp frontend/.env.xlayer-mainnet.example frontend/.env.local
```

The template includes deployed FairFlow Launch addresses, the official X Layer mainnet Universal Router path, the proof PoolId, and two receipt hashes for event backfill. It enables proof-pool swaps with `VITE_PULSEPOOL_ENABLE_SWAP_WRITES=true` while keeping launch creation paused with `VITE_PULSEPOOL_ENABLE_CREATE_WRITES=false`.

## Checks

```bash
pnpm lint
pnpm build
```
