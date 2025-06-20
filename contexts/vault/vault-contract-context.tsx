import React, { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDisconnect, useWalletClient } from 'wagmi'
import {
  addLiquidity,
  getContractAddresses,
  getQuoteToken,
  removeLiquidity,
} from '@clober/v2-sdk'
import {
  getAddress,
  isAddressEqual,
  parseUnits,
  zeroAddress,
  zeroHash,
} from 'viem'
import BigNumber from 'bignumber.js'

import { Currency } from '../../model/currency'
import { Confirmation, useTransactionContext } from '../transaction-context'
import { useChainContext } from '../chain-context'
import { useCurrencyContext } from '../currency-context'
import { maxApprove } from '../../utils/approve20'
import { toPlacesAmountString } from '../../utils/bignumber'
import { sendTransaction } from '../../utils/transaction'
import { RPC_URL } from '../../constants/rpc-url'
import { currentTimestampInSeconds } from '../../utils/date'
import { applyPercent } from '../../utils/bigint'

type VaultContractContext = {
  mint: (
    currency0: Currency,
    currency1: Currency,
    amount0: string,
    amount1: string,
    disableSwap: boolean,
    slippage: number,
  ) => Promise<void>
  burn: (
    currency0: Currency,
    currency1: Currency,
    lpCurrencyAmount: string,
    slippageInput: string,
  ) => Promise<void>
}

const Context = React.createContext<VaultContractContext>({
  mint: () => Promise.resolve(),
  burn: () => Promise.resolve(),
})

export const VaultContractProvider = ({
  children,
}: React.PropsWithChildren<{}>) => {
  const queryClient = useQueryClient()
  const { disconnectAsync } = useDisconnect()

  const { data: walletClient } = useWalletClient()
  const {
    setConfirmation,
    pendingTransactions,
    queuePendingTransaction,
    dequeuePendingTransaction,
  } = useTransactionContext()
  const { selectedChain } = useChainContext()
  const { allowances, prices } = useCurrencyContext()

  useEffect(() => {
    pendingTransactions.forEach((transaction) => {
      if (!transaction.success) {
        dequeuePendingTransaction(transaction.txHash)
        return
      }
      if (transaction.type === 'mint' || transaction.type === 'burn') {
        dequeuePendingTransaction(transaction.txHash)
      }
    })
  }, [dequeuePendingTransaction, pendingTransactions])

  const mint = useCallback(
    async (
      currency0: Currency,
      currency1: Currency,
      amount0: string,
      amount1: string,
      disableSwap: boolean,
      slippage: number,
    ) => {
      let isAllowanceChanged = false
      if (!walletClient || !selectedChain) {
        return
      }
      console.log('mint', {
        currency0,
        currency1,
        amount0,
        amount1,
        disableSwap,
        slippage,
      })

      try {
        setConfirmation({
          title: `Add Liquidity`,
          body: 'Please confirm in your wallet.',
          chain: selectedChain,
          fields: [],
        })

        const spender = getContractAddresses({
          chainId: selectedChain.id,
        }).Minter
        // Max approve for currency0
        if (
          !isAddressEqual(currency0.address, zeroAddress) &&
          allowances[getAddress(spender)][getAddress(currency0.address)] <
            parseUnits(amount0, currency0.decimals)
        ) {
          const confirmation = {
            title: `Max Approve ${currency0.symbol}`,
            body: 'Please confirm in your wallet.',
            chain: selectedChain,
            fields: [],
          }
          setConfirmation(confirmation)
          const transactionReceipt = await maxApprove(
            selectedChain,
            walletClient,
            currency0,
            spender,
            disconnectAsync,
          )
          if (transactionReceipt) {
            queuePendingTransaction({
              ...confirmation,
              type: 'approve',
              txHash: transactionReceipt.transactionHash,
              success: transactionReceipt.status === 'success',
              blockNumber: Number(transactionReceipt.blockNumber),
              timestamp: currentTimestampInSeconds(),
            })
            isAllowanceChanged = true
          }
        }

        // Max approve for currency1
        if (
          !isAddressEqual(currency1.address, zeroAddress) &&
          allowances[getAddress(spender)][getAddress(currency1.address)] <
            parseUnits(amount1, currency1.decimals)
        ) {
          const confirmation = {
            title: `Max Approve ${currency1.symbol}`,
            body: 'Please confirm in your wallet.',
            chain: selectedChain,
            fields: [],
          }
          setConfirmation(confirmation)
          const transactionReceipt = await maxApprove(
            selectedChain,
            walletClient,
            currency1,
            spender,
            disconnectAsync,
          )
          if (transactionReceipt) {
            queuePendingTransaction({
              ...confirmation,
              type: 'approve',
              txHash: transactionReceipt.transactionHash,
              success: transactionReceipt.status === 'success',
              blockNumber: Number(transactionReceipt.blockNumber),
              timestamp: currentTimestampInSeconds(),
            })
            isAllowanceChanged = true
          }
        }

        const baseCurrency = isAddressEqual(
          getQuoteToken({
            chainId: selectedChain.id,
            token0: currency0.address,
            token1: currency1.address,
          }),
          currency0.address,
        )
          ? currency1
          : currency0

        const { transaction, result } = await addLiquidity({
          chainId: selectedChain.id,
          userAddress: walletClient.account.address,
          token0: currency0.address,
          token1: currency1.address,
          salt: zeroHash,
          amount0,
          amount1,
          options: {
            useSubgraph: false,
            rpcUrl: RPC_URL[selectedChain.id],
            disableSwap,
            slippage,
            testnetPrice: prices[baseCurrency.address] ?? 0,
            token0Price: prices[currency0.address] ?? 0,
            token1Price: prices[currency1.address] ?? 0,
          },
        })

        const confirmation = {
          title: `Add Liquidity`,
          body: 'Please confirm in your wallet.',
          chain: selectedChain,
          fields: [
            new BigNumber(result.currencyA.amount).isZero()
              ? undefined
              : {
                  direction: result.currencyA.direction,
                  currency: result.currencyA.currency,
                  label: result.currencyA.currency.symbol,
                  value: toPlacesAmountString(
                    result.currencyA.amount,
                    prices[result.currencyA.currency.address] ?? 0,
                  ),
                },
            new BigNumber(result.currencyB.amount).isZero()
              ? undefined
              : {
                  direction: result.currencyB.direction,
                  currency: result.currencyB.currency,
                  label: result.currencyB.currency.symbol,
                  value: toPlacesAmountString(
                    result.currencyB.amount,
                    prices[result.currencyB.currency.address] ?? 0,
                  ),
                },
            new BigNumber(result.lpCurrency.amount).isZero()
              ? undefined
              : {
                  direction: result.lpCurrency.direction,
                  currency: result.lpCurrency.currency,
                  label: result.lpCurrency.currency.symbol,
                  value: toPlacesAmountString(
                    result.lpCurrency.amount,
                    prices[baseCurrency.address] ?? 0,
                  ),
                },
          ].filter((field) => field !== undefined) as Confirmation['fields'],
        }
        setConfirmation(confirmation)
        if (transaction) {
          const transactionReceipt = await sendTransaction(
            selectedChain,
            walletClient,
            { ...transaction, gas: applyPercent(transaction.gas, 150) },
            disconnectAsync,
          )
          if (transactionReceipt) {
            queuePendingTransaction({
              ...confirmation,
              type: 'mint',
              txHash: transactionReceipt.transactionHash,
              success: transactionReceipt.status === 'success',
              blockNumber: Number(transactionReceipt.blockNumber),
              timestamp: currentTimestampInSeconds(),
            })
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['balances'] }),
          isAllowanceChanged
            ? queryClient.invalidateQueries({ queryKey: ['allowances'] })
            : undefined,
          queryClient.invalidateQueries({ queryKey: ['vault'] }),
          queryClient.invalidateQueries({ queryKey: ['vault-lp-balances'] }),
        ])
        setConfirmation(undefined)
      }
    },
    [
      allowances,
      disconnectAsync,
      prices,
      queryClient,
      queuePendingTransaction,
      selectedChain,
      setConfirmation,
      walletClient,
    ],
  )

  const burn = useCallback(
    async (
      currency0: Currency,
      currency1: Currency,
      lpCurrencyAmount: string,
      slippageInput: string,
    ) => {
      if (!walletClient || !selectedChain) {
        return
      }
      console.log('burn', {
        currency0,
        currency1,
        lpCurrencyAmount,
        slippageInput,
      })

      try {
        setConfirmation({
          title: `Remove Liquidity`,
          body: 'Please confirm in your wallet.',
          chain: selectedChain,
          fields: [],
        })

        const baseCurrency = isAddressEqual(
          getQuoteToken({
            chainId: selectedChain.id,
            token0: currency0.address,
            token1: currency1.address,
          }),
          currency0.address,
        )
          ? currency1
          : currency0

        const { result, transaction } = await removeLiquidity({
          chainId: selectedChain.id,
          userAddress: walletClient.account.address,
          token0: currency0.address,
          token1: currency1.address,
          salt: zeroHash,
          amount: lpCurrencyAmount,
          options: {
            gasLimit: 2_000_000n,
            useSubgraph: false,
            rpcUrl: RPC_URL[selectedChain.id],
            slippage: Number(slippageInput),
          },
        })

        const confirmation = {
          title: `Remove Liquidity`,
          body: 'Please confirm in your wallet.',
          chain: selectedChain,
          fields: [
            new BigNumber(result.currencyA.amount).isZero()
              ? undefined
              : {
                  direction: result.currencyA.direction,
                  currency: result.currencyA.currency,
                  label: result.currencyA.currency.symbol,
                  value: toPlacesAmountString(
                    result.currencyA.amount,
                    prices[result.currencyA.currency.address] ?? 0,
                  ),
                },
            new BigNumber(result.currencyB.amount).isZero()
              ? undefined
              : {
                  direction: result.currencyB.direction,
                  currency: result.currencyB.currency,
                  label: result.currencyB.currency.symbol,
                  value: toPlacesAmountString(
                    result.currencyB.amount,
                    prices[result.currencyB.currency.address] ?? 0,
                  ),
                },
            new BigNumber(result.lpCurrency.amount).isZero()
              ? undefined
              : {
                  direction: result.lpCurrency.direction,
                  currency: result.lpCurrency.currency,
                  label: result.lpCurrency.currency.symbol,
                  value: toPlacesAmountString(
                    result.lpCurrency.amount,
                    prices[baseCurrency.address] ?? 0,
                  ),
                },
          ].filter((field) => field !== undefined) as Confirmation['fields'],
        }
        setConfirmation(confirmation)

        if (transaction) {
          const transactionReceipt = await sendTransaction(
            selectedChain,
            walletClient,
            transaction,
            disconnectAsync,
          )
          if (transactionReceipt) {
            queuePendingTransaction({
              ...confirmation,
              type: 'burn',
              txHash: transactionReceipt.transactionHash,
              success: transactionReceipt.status === 'success',
              blockNumber: Number(transactionReceipt.blockNumber),
              timestamp: currentTimestampInSeconds(),
            })
          }
        }
      } catch (e) {
        console.error(e)
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['balances'] }),
          queryClient.invalidateQueries({ queryKey: ['vault'] }),
          queryClient.invalidateQueries({ queryKey: ['vault-lp-balances'] }),
        ])
        setConfirmation(undefined)
      }
    },
    [
      disconnectAsync,
      prices,
      queryClient,
      queuePendingTransaction,
      selectedChain,
      setConfirmation,
      walletClient,
    ],
  )

  return (
    <Context.Provider
      value={{
        mint,
        burn,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export const useVaultContractContext = () =>
  React.useContext(Context) as VaultContractContext
