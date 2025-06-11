import { CHAIN_IDS, getContractAddresses } from '@clober/v2-sdk'
import { getAddress } from 'viem'
import { base, monadTestnet } from 'viem/chains'

import { Aggregator } from '../model/aggregator'
import { MagpieAggregator } from '../model/aggregator/magpie'
import { OpenOceanAggregator } from '../model/aggregator/openocean'
import { CloberV2Aggregator } from '../model/aggregator/clober-v2'
import { AggregatorRouterGateway } from '../model/aggregator/router-gateway'

import { riseSepolia } from './chains/rise-sepolia'

export const AGGREGATORS: {
  [chain in CHAIN_IDS]: Aggregator[]
} = {
  [CHAIN_IDS.BASE]: [
    // new OdosAggregator(
    //   getAddress('0x19cEeAd7105607Cd444F5ad10dd51356436095a1'),
    //   findSupportChain(CHAIN_IDS.BASE.valueOf())!,
    // ),
    new MagpieAggregator(
      getAddress('0x5E766616AaBFB588E23a8EA854e9dbd1042afFD3'),
      base,
    ),
  ],
  [CHAIN_IDS.MONAD_TESTNET]: [
    new CloberV2Aggregator(
      getContractAddresses({ chainId: CHAIN_IDS.MONAD_TESTNET }).Controller,
      monadTestnet,
    ),
    // new OpenOceanAggregator(
    //   getAddress('0x6352a56caadC4F1E25CD6c75970Fa768A3304e64'),
    //   monadTestnet,
    // ),
    new AggregatorRouterGateway(
      getAddress('0xfD845859628946B317A78A9250DA251114FbD846'),
      monadTestnet,
      new OpenOceanAggregator(
        getAddress('0x6352a56caadC4F1E25CD6c75970Fa768A3304e64'),
        monadTestnet,
      ),
    ),
  ],
  [CHAIN_IDS.RISE_SEPOLIA]: [
    new CloberV2Aggregator(
      getContractAddresses({ chainId: CHAIN_IDS.RISE_SEPOLIA }).Controller,
      riseSepolia,
    ),
  ],
}
