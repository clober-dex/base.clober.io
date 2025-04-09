import {
  CHAIN_IDS,
  formatPrice,
  getQuoteToken,
  getSubgraphEndpoint,
} from '@clober/v2-sdk'
import { getAddress, isAddressEqual, PublicClient, zeroAddress } from 'viem'
import { getCurrentTimestamp } from 'hardhat/internal/hardhat-network/provider/utils/getCurrentTimestamp'

import { Subgraph } from '../model/subgraph'
import { ERC20_PERMIT_ABI } from '../abis/@openzeppelin/erc20-permit-abi'
import { Prices } from '../model/prices'
import { formatUnits } from '../utils/bigint'
import { Market } from '../model/market'

type TokenDto = {
  id: string
  decimals: string
  name: string
  symbol: string
}

type BookDto = {
  id: string
  quote: {
    id: string
    decimals: string
    name: string
    symbol: string
  }
  base: {
    id: string
    decimals: string
    name: string
    symbol: string
  }
  depths: {
    id: string
  }[]
  latestPrice: string
  latestTimestamp: string
}

export const fetchAllMarkets = async (
  publicClient: PublicClient,
  chainId: CHAIN_IDS,
  prices: Prices,
  verifiedTokenAddresses: `0x${string}`[],
): Promise<Market[]> => {
  const currentTimestampInSeconds = getCurrentTimestamp()
  const dailyNormalizedCurrentTimestampInSeconds =
    currentTimestampInSeconds - (currentTimestampInSeconds % (24 * 60 * 60))

  const endpoint = getSubgraphEndpoint({ chainId })
  const {
    data: { tokens },
  } = await Subgraph.get<{
    data: {
      tokens: TokenDto[]
    }
  }>(
    endpoint,
    'getTokens',
    'query getTokens { tokens(first: 1000) { id name symbol decimals } }',
    {},
  )

  const tokenAddresses = [
    ...new Set([
      ...verifiedTokenAddresses.map((address) => getAddress(address)),
      ...tokens.map((token) => getAddress(token.id)),
    ]),
  ]
  const {
    data: { books },
  } = await Subgraph.get<{
    data: {
      books: BookDto[]
    }
  }>(
    endpoint,
    'getMarkets',
    'query getMarkets($baseAddresses: [String!], $quoteAddresses: [String!]) { books( first: 1000 where: {and: [{base_in: $baseAddresses}, {quote_in: $quoteAddresses}]} ) { id base { id decimals name symbol } quote { id decimals name symbol } depths { id } latestPrice latestTimestamp } }',
    {
      baseAddresses: tokenAddresses.map((address) => address.toLowerCase()),
      quoteAddresses: tokenAddresses.map((address) => address.toLowerCase()),
    },
  )

  const totalSupplies = await publicClient.multicall({
    contracts: tokenAddresses
      .filter((address) => !isAddressEqual(address, zeroAddress))
      .map((address) => ({
        address,
        abi: ERC20_PERMIT_ABI,
        functionName: 'totalSupply',
      })),
  })

  const totalSupplyMap: {
    [address: `0x${string}`]: bigint
  } = tokenAddresses
    .map((address, index) => [address, totalSupplies[index]] as const)
    .reduce(
      (acc, [address, result]) => {
        if (address && result && result?.result) {
          acc[getAddress(address as string)] = (result?.result as bigint) ?? 0n
        }
        return acc
      },
      {
        [zeroAddress]: 120_000_000n * 1000000000000000000n, // DEV: 120M for ETH,
      } as { [address: `0x${string}`]: bigint },
    )

  const marketCodes = books
    .map((book) => {
      const quoteAddress = getAddress(book.quote.id)
      if (
        isAddressEqual(
          quoteAddress,
          getQuoteToken({
            chainId,
            token0: getAddress(book.base.id),
            token1: getAddress(book.quote.id),
          }),
        )
      ) {
        return `${book.base.id.toLowerCase()}/${book.quote.id.toLowerCase()}-1d-${dailyNormalizedCurrentTimestampInSeconds}`
      }
      return null
    })
    .filter((code) => code !== null) as string[]

  const {
    data: { chartLogs },
  } = await Subgraph.get<{
    data: {
      chartLogs: {
        id: string
        marketCode: string
        close: string
        open: string
        baseVolume: string
      }[]
    }
  }>(
    endpoint,
    'getChartLogs',
    'query getChartLogs($marketCodes: [ID!]) { chartLogs( orderBy: timestamp orderDirection: desc where: {id_in: $marketCodes} ) { marketCode id close open baseVolume } }',
    {
      marketCodes,
    },
  )

  return books
    .map((book) => {
      const quoteAddress = getAddress(book.quote.id)
      if (
        isAddressEqual(
          quoteAddress,
          getQuoteToken({
            chainId,
            token0: getAddress(book.base.id),
            token1: getAddress(book.quote.id),
          }),
        ) &&
        book.depths.length > 0
      ) {
        const chartLog = chartLogs.find(
          (log) =>
            `${book.base.id.toLowerCase()}/${book.quote.id.toLowerCase()}` ===
            log.marketCode,
        )
        const latestPrice = Number(
          formatPrice(
            BigInt(book.latestPrice),
            Number(book.quote.decimals),
            Number(book.base.decimals),
          ),
        )
        const totalSupply = totalSupplyMap[getAddress(book.base.id)] ?? 0n
        return {
          baseCurrency: {
            address: getAddress(book.base.id),
            decimals: Number(book.base.decimals),
            name: book.base.name,
            symbol: book.base.symbol,
          },
          quoteCurrency: {
            address: getAddress(book.quote.id),
            decimals: Number(book.quote.decimals),
            name: book.quote.name,
            symbol: book.quote.symbol,
          },
          createAt: 1741087719, // TODO: fix it
          updatedAt: Number(book.latestTimestamp),
          price: latestPrice,
          dailyVolume:
            Number(chartLog?.baseVolume ?? 0) *
            (prices[getAddress(book.base.id)] ?? 0),
          fdv:
            Number(formatUnits(totalSupply, Number(book.base.decimals) ?? 0n)) *
            latestPrice,
          dailyChange: (latestPrice * 100) / Number(chartLog?.open ?? 1),
          verified:
            verifiedTokenAddresses
              .map((address) => getAddress(address))
              .includes(getAddress(book.base.id)) &&
            verifiedTokenAddresses
              .map((address) => getAddress(address))
              .includes(getAddress(book.quote.id)),
        }
      }
      return null
    })
    .filter((market) => market !== null)
}
