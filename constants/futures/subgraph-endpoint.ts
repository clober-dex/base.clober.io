import { CHAIN_IDS } from '@clober/v2-sdk'

export const FUTURES_SUBGRAPH_ENDPOINT: {
  [chainId in CHAIN_IDS]: string | undefined
} = {
  [CHAIN_IDS.BASE]: undefined,
  [CHAIN_IDS.MONAD_TESTNET]:
    'https://api.goldsky.com/api/public/project_clsljw95chutg01w45cio46j0/subgraphs/clober-futures-subgraph-monad-testnet/v1.0.10/gn',
  [CHAIN_IDS.RISE_SEPOLIA]: undefined,
}
