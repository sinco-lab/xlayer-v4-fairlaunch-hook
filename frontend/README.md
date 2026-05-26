# PulsePool Frontend

Vite/React dashboard, read-only Agent Report, and Phase 13 X Layer testnet transaction UX for the PulsePool demo.

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

When required values are missing, the UI shows a configuration state. Mock or preview-only surfaces are explicitly labeled.

## Write Flow

The frontend keeps read-only and write surfaces separate:

- `Market Dashboard` reads MetricsLens and FairFlowHook events.
- `Agent Report` generates read-only narrative from loaded state.
- `Swap Demo` can send live testnet transactions when write config and wallet guards pass.
- `Create Launch Pool` remains a guided preview until pool initialization, launch registration, and liquidity setup are browser-ready end to end.

To enable browser wallet swaps:

```bash
cp frontend/.env.xlayer-testnet.example frontend/.env.local
```

Then set:

```bash
VITE_PULSEPOOL_ENABLE_WRITES=true
```

After `pnpm dev`, connect a wallet on X Layer testnet, open `Swap Demo`, approve the input token when required, and submit the demo swap. Successful swaps show the tx hash, explorer link, receipt proof, and refreshed dashboard/event/report state.

For X Layer mainnet read-only preparation after deployment:

```bash
cp frontend/.env.xlayer-mainnet.example frontend/.env.local
```

Fill deployed PulsePool addresses, keep `VITE_PULSEPOOL_ENABLE_WRITES=false`, and leave `VITE_SWAP_ROUTER_ADDRESS` blank until the frontend is upgraded from the self-hosted testnet router ABI to a proven mainnet router path.

## Checks

```bash
pnpm lint
pnpm build
```
