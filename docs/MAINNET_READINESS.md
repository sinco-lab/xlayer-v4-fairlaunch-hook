# PulsePool Mainnet Readiness

PulsePool should not be presented as production-ready until every item below is checked on the exact target network.

## Source Check

Last checked: 2026-05-27.

Official references:

- X Layer network information: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer RPC endpoints: https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints
- X Layer Foundry verification: https://web3.okx.com/xlayer/docs/developer/verify-a-smart-contract/verify-with-foundry
- Uniswap v4 deployments: https://developers.uniswap.org/docs/protocols/v4/deployments

Re-check these pages immediately before broadcast. The checked-in values are deployment prep defaults, not a permanent source of truth.

## Current Position

- X Layer testnet demo is proven with a self-hosted Uniswap v4 stack.
- Browser wallet swap proof exists on X Layer testnet.
- X Layer mainnet contract stack, proof pool, bounded liquidity, and Hook-triggering demo swaps are deployed.
- Create Launch Pool browser writes remain guarded. The public mainnet build may enable the configured proof-pool swap path while keeping launch creation paused.
- The project is unaudited and remains hackathon-grade until review and monitoring are added.

## Official Mainnet Inputs

Network:

| Field | Value |
| --- | --- |
| Network | X Layer mainnet |
| Chain ID | `196` |
| Native gas token | `OKB` |
| Primary RPC | `https://rpc.xlayer.tech` |
| Fallback RPC | `https://xlayerrpc.okx.com` |
| Explorer | `https://www.okx.com/web3/explorer/xlayer` |

Uniswap v4 infrastructure for X Layer mainnet:

| Contract | Address |
| --- | --- |
| PoolManager | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |
| PositionManager | `0xcF1EAFC6928dC385A342E7C6491d371d2871458b` |
| StateView | `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990` |
| Universal Router | `0xDa00aE15d3A71466517129255255db7c0c0956d3` |
| Universal Router 2.1.1 | `0x8B844f885672f333Bc0042cB669255f93a4C1E6b` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## Pre-Broadcast Gate

Confirm:

- Target network is X Layer mainnet, chain ID `196`.
- Current official Uniswap v4 mainnet addresses are rechecked.
- Deployer address is correct.
- Deployer has enough OKB for deployment, pool init, liquidity, and demo swaps.
- `.env` and private keys are local-only and ignored.
- `forge fmt --check`, `forge build`, and `forge test -vvv` pass.
- `DeployXLayer.s.sol` dry-run passes against the exact RPC URL.
- Launch token, quote token, fee range, launch window, max buy, and cooldown are intentionally chosen.

Allowed before explicit broadcast approval:

- `cast chain-id --rpc-url "$XLAYER_RPC_URL"`
- `cast code <official-or-deployed-address> --rpc-url "$XLAYER_RPC_URL"`
- `cast balance <deployer-address> --rpc-url "$XLAYER_RPC_URL"`
- `forge script script/DeployXLayer.s.sol --rpc-url "$XLAYER_RPC_URL"` without `--broadcast`

Not allowed in this phase:

- `--broadcast`
- `cast send`
- enabling `VITE_PULSEPOOL_ENABLE_WRITES=true` on chain ID `196`
- copying or printing `PRIVATE_KEY`, mnemonic, or wallet seed material

Preflight command set:

```bash
cp contracts/.env.xlayer-mainnet.example contracts/.env
cd contracts
forge fmt --check
forge build
forge test -vvv
forge script script/DeployXLayer.s.sol --rpc-url "$XLAYER_RPC_URL"
```

If the dry-run fails because an official address has no code, stop and re-check the Uniswap deployment page before changing any script defaults.

## Broadcast Gate

Record:

- Deployment tx hashes.
- Contract addresses.
- PoolId.
- Initial liquidity tx.
- Launch registration tx.
- First healthy swap tx.
- Receipt logs proving `FairFlowSwap` and `MarketScoreUpdated`.
- FlowPass mint or upgrade proof if the launch window and health gates allow it.

Manual approval record before broadcast:

```text
Network: X Layer mainnet
Chain ID observed:
RPC URL:
Deployer address:
Deployer OKB balance:
PoolManager:
PositionManager:
StateView:
Universal Router:
Permit2:
Launch token name/symbol:
Quote token name/symbol:
Max gas / spending cap:
Approver:
Approval time:
```

Never include private key, seed phrase, or raw secret RPC credentials in this record.

## Product Gate

Before calling this a production project:

- Event stream must show live or configured proof logs without contradictory warnings.
- FlowPass panel must show current tier and issuance proof state.
- Create Launch Pool must remain disabled unless every write path has wallet simulation, guardrails, and receipt proof.
- Mainnet frontend config must be separated from testnet config.
- Monitoring must cover RPC failures, event read failures, reverted swaps, and launch guard triggers.
- Security notes and known limitations must be visible to reviewers.

## Mainnet Frontend Gate

Use `frontend/.env.xlayer-mainnet.example` only after the mainnet contracts are deployed.

Required stance:

- `VITE_PULSEPOOL_ENABLE_WRITES=false` stays fixed for the public mainnet build; use `VITE_PULSEPOOL_ENABLE_SWAP_WRITES=true` only for the configured proof-pool swap path.
- `VITE_PULSEPOOL_ENABLE_CREATE_WRITES=false` keeps token launch and pool creation paused until broader production review.
- `VITE_SWAP_ROUTER_ADDRESS` uses the official X Layer mainnet Universal Router after the Universal Router path is encoded and receipt-proven.
- Dashboard, Agent Report, FlowPass proof, and event stream are enabled with deployed mainnet addresses.
- Create Launch Pool remains guarded; pool initialization and `registerLaunch` require wallet simulation, clear PoolKey uniqueness, and receipt proof before broader production exposure.

## Suggested Mainnet Sequence

Completed sequence:

1. Dry-run mainnet deployment and proof-pool preparation against X Layer mainnet.
2. Broadcast deployment.
3. Initialize the dynamic-fee v4 pool.
4. Register launch config through `LaunchFactory`.
5. Add bounded demo liquidity.
6. Execute three Universal Router swaps through the FairFlow Hook pool.
7. Verify receipts and onchain readback.
8. Update `docs/ADDRESSES.md` and frontend mainnet config.

## Phase 15 Exit Criteria

- Mainnet env examples exist for contracts and frontend without secrets.
- Official network and Uniswap v4 addresses are documented with source links.
- Dry-run, broadcast, verification, and frontend gates are separated.
- No mainnet transaction is sent during this phase.

## Phase 15 Preflight Evidence

Run date: 2026-05-27.

Completed:

- `cast chain-id --rpc-url https://rpc.xlayer.tech` returned `196`.
- `cast code` returned non-empty bytecode for PoolManager, PositionManager, StateView, Universal Router, and Permit2.
- `forge script script/DeployXLayer.s.sol --rpc-url https://rpc.xlayer.tech` completed without `--broadcast`.
- Estimated deploy script gas: `16,572,706`.
- Estimated native gas required: `0.000688254901155932` in Forge output. On X Layer, the native gas token is OKB.

The dry-run deployment addresses printed by Forge are simulation outputs only. Do not copy them into `docs/ADDRESSES.md` as deployed mainnet contracts.

## Mainnet Proof Evidence

Run date: 2026-05-29.

Completed:

- `PrepareXLayerMainnetDemoPool.s.sol` dry-run completed successfully before broadcast.
- Broadcast completed with `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`.
- Pool init tx: `0x00a7e164ad3bf5b314b8528fb421abfd28bf8b4de2b552c72beca4c52885da4f`.
- Launch registration tx: `0x7f98bd33d6f34a20fdd60faa81dce35a19447bacd949cbf143d227e3a466009e`.
- Liquidity tx: `0x97f347fa19980fe9db361e872f5d3806964d22401fad21db6be04b330e6b2aa7`.
- Universal Router swap txs: `0x0edeb154ee7cba0c3bc9125feb1d86c986a248f923d0ce5899b68de42da7f617`, `0xadc55c76a676f156e9a89604d69ca262c295e30c428d1dcfb89e4573004729ed`, `0x469907b259ecaaed8f46f8a1d8599cccff49a2fe212808acd5c801951d538a06`.
- Readback confirmed `registeredLaunches=true`, launch creator `0x98a078b22b258b30532F73c0187b7e7296047a57`, `isLaunchConfigured=true`, and current fee `32998`.
