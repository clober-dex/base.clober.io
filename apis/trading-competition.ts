import { CHAIN_IDS } from '@clober/v2-sdk'
import { getAddress, isAddressEqual } from 'viem'

import { Subgraph } from '../model/subgraph'
import { FUTURES_SUBGRAPH_ENDPOINT } from '../constants/futures/subgraph-endpoint'
import { Prices } from '../model/prices'
import { formatUnits } from '../utils/bigint'
import { TradingCompetitionPnl } from '../model/trading-competition-pnl'

export const fetchTradingCompetitionLeaderboard = async (
  chainId: CHAIN_IDS,
  prices: Prices,
  userAddress?: `0x${string}`,
): Promise<{
  userPnL: TradingCompetitionPnl
  allUsersPnL: {
    [user: `0x${string}`]: TradingCompetitionPnl
  }
}> => {
  if (!FUTURES_SUBGRAPH_ENDPOINT[chainId]) {
    return {
      userPnL: {
        totalPnl: 0,
        trades: [],
      },
      allUsersPnL: {},
    }
  }

  const {
    data: {
      sortedTradesByRealizedPnL,
      sortedTradesByEstimateHolding,
      myTrades,
    },
  } = await Subgraph.get<{
    data: {
      sortedTradesByRealizedPnL: Array<{
        user: { id: string }
        token: { id: string; decimals: string; name: string; symbol: string }
        realizedPnL: string
        estimatedHolding: string
      }>
      sortedTradesByEstimateHolding: Array<{
        user: { id: string }
        token: { id: string; decimals: string; name: string; symbol: string }
        realizedPnL: string
        estimatedHolding: string
      }>
      myTrades: Array<{
        user: { id: string }
        token: { id: string; decimals: string; name: string; symbol: string }
        realizedPnL: string
        estimatedHolding: string
      }>
    }
  }>(
    FUTURES_SUBGRAPH_ENDPOINT[chainId]!,
    'getTrades',
    'query getTrades($userAddress: String!) { sortedTradesByRealizedPnL: trades( first: 1000 orderBy: realizedPnL orderDirection: desc where: {user_: {isRegistered: true}} ) { user { id } token { id decimals name symbol } realizedPnL estimatedHolding } sortedTradesByEstimateHolding: trades( first: 1000 orderBy: estimatedHolding orderDirection: desc where: {user_: {isRegistered: true}} ) { user { id } token { id decimals name symbol } realizedPnL estimatedHolding } myTrades: trades(where: {user: $userAddress}) { user { id } token { id decimals name symbol } realizedPnL estimatedHolding } }',
    {
      userAddress: userAddress ? userAddress.toLowerCase() : '',
    },
  )
  const intersectionUsers = sortedTradesByRealizedPnL
    .map((trade) => getAddress(trade.user.id))
    .filter((user) =>
      sortedTradesByEstimateHolding.some((trade) =>
        isAddressEqual(getAddress(trade.user.id), getAddress(user)),
      ),
    )
  const trades = intersectionUsers.map((user) => {
    const trade = sortedTradesByRealizedPnL.find((trade) =>
      isAddressEqual(getAddress(trade.user.id), getAddress(user)),
    )!
    const token = getAddress(trade.token.id)
    const amount = formatUnits(
      BigInt(trade.estimatedHolding),
      Number(trade.token.decimals),
    )
    return {
      user,
      currency: {
        address: token,
        symbol: trade.token.symbol,
        name: trade.token.name,
        decimals: Number(trade.token.decimals),
      },
      amount: Number(amount),
      pnl: Number(trade.realizedPnL) + Number(amount) * prices[token],
    }
  })

  return {
    userPnL: {
      totalPnl: myTrades.reduce((acc, trade) => {
        const token = getAddress(trade.token.id)
        const amount = formatUnits(
          BigInt(trade.estimatedHolding),
          Number(trade.token.decimals),
        )
        const pnl = Number(trade.realizedPnL) + Number(amount) * prices[token]
        return acc + pnl
      }, 0),
      trades: myTrades.map((trade) => {
        const token = getAddress(trade.token.id)
        const amount = formatUnits(
          BigInt(trade.estimatedHolding),
          Number(trade.token.decimals),
        )
        const pnl = Number(trade.realizedPnL) + Number(amount) * prices[token]
        return {
          currency: {
            address: token,
            symbol: trade.token.symbol,
            name: trade.token.name,
            decimals: Number(trade.token.decimals),
          },
          pnl,
          amount: Number(amount),
        }
      }),
    },
    allUsersPnL: trades.reduce(
      (acc, trade) => {
        const user = getAddress(trade.user)
        if (!acc[user]) {
          acc[user] = {
            totalPnl: 0,
            trades: [],
          }
        }
        acc[user].totalPnl += trade.pnl
        acc[user].trades.push({
          currency: {
            address: trade.currency.address,
            symbol: trade.currency.symbol,
            name: trade.currency.name,
            decimals: trade.currency.decimals,
          },
          pnl: trade.pnl,
          amount: trade.amount,
        })
        return acc
      },
      {} as {
        [user: `0x${string}`]: TradingCompetitionPnl
      },
    ),
  }
}
