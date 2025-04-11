import React, { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'

import { deduplicateCurrencies } from '../../utils/currency'
import { useCurrencyContext } from '../currency-context'
import { useChainContext } from '../chain-context'
import { fetchFuturesPositions } from '../../apis/futures/position'
import { UserPosition } from '../../model/futures/user-position'
import { fetchFuturesAssets } from '../../apis/futures/asset'
import { Asset } from '../../model/futures/asset'

type FuturesContext = {
  assets: Asset[]
  positions: UserPosition[]
}

const Context = React.createContext<FuturesContext>({
  assets: [],
  positions: [],
})

export const FuturesProvider = ({ children }: React.PropsWithChildren<{}>) => {
  const { selectedChain } = useChainContext()
  const { prices } = useCurrencyContext()
  const { address: userAddress } = useAccount()
  const { setCurrencies, whitelistCurrencies } = useCurrencyContext()

  const { data: assets } = useQuery({
    queryKey: ['futures-assets', selectedChain.id],
    queryFn: async () => {
      return fetchFuturesAssets(selectedChain.id)
    },
    initialData: [],
  }) as {
    data: Asset[]
  }

  const { data: positions } = useQuery({
    queryKey: ['futures-positions', userAddress, selectedChain.id],
    queryFn: async () => {
      if (!userAddress) {
        return []
      }
      return fetchFuturesPositions(selectedChain.id, userAddress, prices)
    },
    initialData: [],
    refetchIntervalInBackground: true,
    refetchInterval: 2 * 1000, // checked
  }) as {
    data: UserPosition[]
  }

  useEffect(() => {
    setCurrencies(
      deduplicateCurrencies([
        ...whitelistCurrencies,
        ...assets.map((asset) => asset.currency),
        ...assets.map((asset) => asset.collateral),
      ]),
    )
  }, [assets, setCurrencies, whitelistCurrencies])

  return (
    <Context.Provider
      value={{
        assets,
        positions,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export const useFuturesContext = () =>
  React.useContext(Context) as FuturesContext
