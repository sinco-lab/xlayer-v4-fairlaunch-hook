# PulsePool Addresses

## Source References

- Uniswap v4 deployments: https://developers.uniswap.org/docs/protocols/v4/deployments
- X Layer network information: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer RPC endpoints: https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints

Last source check: 2026-05-29. Re-check the source references immediately before any mainnet broadcast.

## X Layer Mainnet

Network:

- Chain ID: `196`
- Native gas token: `OKB`
- Public RPCs: `https://rpc.xlayer.tech`, `https://xlayerrpc.okx.com`
- Explorer: `https://www.okx.com/web3/explorer/xlayer`

Current Uniswap v4 addresses confirmed for X Layer mainnet. These are official infrastructure addresses, not PulsePool deployment outputs:

| Contract | Address |
| --- | --- |
| PoolManager | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |
| PositionManager | `0xcF1EAFC6928dC385A342E7C6491d371d2871458b` |
| StateView | `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990` |
| Universal Router | `0xDa00aE15d3A71466517129255255db7c0c0956d3` |
| Universal Router 2.1.1 | `0x8B844f885672f333Bc0042cB669255f93a4C1E6b` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

## X Layer Testnet

Network:

- Chain ID: `1952`
- Native gas token: `OKB`
- Public RPCs: `https://testrpc.xlayer.tech/terigon`, `https://xlayertestrpc.okx.com/terigon`
- Explorer: `https://www.okx.com/web3/explorer/xlayer-test`

Uniswap v4 official deployments were not listed for X Layer testnet in the current Uniswap v4 deployments page. Do not assume the mainnet addresses are valid on testnet.

### PulsePool Self-Hosted Testnet Demo

Use `contracts/script/DeployXLayerTestnetDemo.s.sol` for dry-run or broadcast. These addresses must be labeled as `self-hosted demo v4 stack on X Layer testnet`.

| Item | Address / Tx Hash |
| --- | --- |
| Network | `X Layer testnet` |
| Chain ID | `1952` |
| Deployer | `0x98a078b22b258b30532F73c0187b7e7296047a57` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Demo PoolManager | `0xF0B851d2C292d4Bae654De7D8A53C7fA6DAc6Ec0` |
| Demo PositionManager | `0xdD821831A0002447c5FcA329E898a286B99FD6f9` |
| Demo SwapRouter | `0x16B3c4629FB0D61BaD533f6442ac96fE35Db76e0` |
| DemoToken token0 | `0xCb51e38BEA371644BbafDE9e4972301c610fb8e7` |
| DemoToken token1 | `0xe2e1a6AD6D596Cd88b27C82173eD9099609eE869` |
| FairFlowHook | `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0` |
| FlowPassNFT | `0xCFC3ba5a5834B223bE4e29eDC90806E03F416B12` |
| LaunchFactory | `0x790250553E1a667B0A07395d40e4AE15ed5a8f83` |
| MetricsLens | `0x4a2387e529bce6Cda57B1C1127eDC4bc35a70a59` |
| PoolId | `0xa212f003231c263e421438d11bbf49743598681f58326cd7c7a83f4463085040` |
| Deployment tx hashes | PoolManager `0x856097daa967d65389ff008d149940f61b9b36b9c9dd9a121b0023195f5d51d5`; PositionManager `0xe253f8edfa62c41ffdaecc50aa5a51251ac57a8750a9419d9e77f5879f903f90`; SwapRouter `0x901945ec6c282b0c0a0b6b71df35474b525b2342e218d0df21df8eb7ec855f37`; FairFlowHook `0x3a1ff4152e86150fc836f29ed8bbcc8e96a32ba3ce4d3d587220d762aa8a3521`; MetricsLens `0xc69018de15743889c8baec05915bc62c659eca7be680d72e98702d20da6b7e0a` |
| Demo swap tx hash | `0x950dbe07fadfb554e169bd0d5b3c82480de3be757631242c3a2b5552fb55f8b9` |
| Browser wallet demo swap tx hash | `0x2210b8e6d0dc35fd3836a947607b377f8bbddb15cafd0e79ec8c7511ef43aff8` |
| Hook event proof | `FairFlowSwap` and `MarketScoreUpdated` emitted by `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0` in tx `0x950dbe07fadfb554e169bd0d5b3c82480de3be757631242c3a2b5552fb55f8b9` |
| Browser receipt proof | Receipt status `success` in block `31348532`; logs include `FairFlowHook` address `0x8430574aeee6537F0C9699ec643BF58295Fcd0c0` in tx `0x2210b8e6d0dc35fd3836a947607b377f8bbddb15cafd0e79ec8c7511ef43aff8` |

## PulsePool Mainnet Deployment Record

Mainnet status: PulsePool contract stack, proof pool, bounded liquidity, and Hook-triggering demo swaps are deployed on X Layer mainnet.

Do not record private keys, mnemonics, RPC secrets, or deployer seed data.

| Item | Address / Tx Hash |
| --- | --- |
| Network | `X Layer mainnet` |
| Chain ID | `196` |
| Deployer | `0x98a078b22b258b30532F73c0187b7e7296047a57` |
| DemoToken token0 | `0x9Aa9313467F791f5AC031F5f130cA07F23e25204` |
| DemoToken token1 | `0xd641ed64bbe3dB2856E6523a2968D33Ff5e55d22` |
| FairFlowHook | `0xc560CD40AcD57db2eD18373351fDcf9211d890C0` |
| FlowPassNFT | `0xCb51e38BEA371644BbafDE9e4972301c610fb8e7` |
| LaunchFactory | `0xe2e1a6AD6D596Cd88b27C82173eD9099609eE869` |
| MetricsLens | `0x8683aD69A2DbEaFb4B361f7A13B714002466C613` |
| PoolId | `0x3807e437ed58e8b9047419a93bc1ca9a51455cf0b81cba7a9637e1caba439138` |
| Deployment tx hashes | Token1 `0x135a4fbb46292bb9abaab3f5de01faebb5b78f3b0d37e72c227f80432fa255dc`; Token0 `0x3a586c3d017bfeb52d34abc4c6d7fdc0d0c1e19b14d2f09efd3d1cc16658c8c9`; FairFlowHook `0xfd419812b96419373af9159750cf399950289707d52ee194976dec9a90c4497c`; FlowPassNFT `0x98ec800d033d0982368346f2f851e28e77646bd56928df3cdf1fff513f6e210e`; LaunchFactory `0xab240ddf5496d72facb5b5eec0ee073c6e542bfef674d9eda75f64bc80cf00aa`; MetricsLens `0x20ecdda65fac4c5df9d38a860f0a6286cf4bb354cdd18d90034a9e8243af2762`; FlowPass minter setup `0x9b530dfa4dca4dfb53b71ea63979d1f4ebc0cd46eff88b7b025faa43d2c7015c`; Hook FlowPass setup `0x52fecb4f669d9a9faea60e6fd5b0617d7b370557959af92536530a2b165e4fc4`; Hook config writer setup `0x0d6debf5b55f235f86d4288949c7a44e6bf2c49595608321030214cd0ed34b8c` |
| Pool init tx | `0x00a7e164ad3bf5b314b8528fb421abfd28bf8b4de2b552c72beca4c52885da4f` |
| Launch registration tx | `0x7f98bd33d6f34a20fdd60faa81dce35a19447bacd949cbf143d227e3a466009e` |
| Liquidity tx | `0x97f347fa19980fe9db361e872f5d3806964d22401fad21db6be04b330e6b2aa7` |
| Demo swap tx hashes | `0x0edeb154ee7cba0c3bc9125feb1d86c986a248f923d0ce5899b68de42da7f617`; `0xadc55c76a676f156e9a89604d69ca262c295e30c428d1dcfb89e4573004729ed`; `0x469907b259ecaaed8f46f8a1d8599cccff49a2fe212808acd5c801951d538a06` |
| Hook event proof | `FairFlowSwap` and `MarketScoreUpdated` emitted by `0xc560CD40AcD57db2eD18373351fDcf9211d890C0`; onchain readback returned `registeredLaunches=true`, creator `0x98a078b22b258b30532F73c0187b7e7296047a57`, current fee `32998`, and all listed pool/swap receipts succeeded. |
