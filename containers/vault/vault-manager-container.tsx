import { useRouter } from 'next/router'
import React, { useEffect, useMemo, useRef } from 'react'
import { useWalletClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { isAddressEqual, parseUnits, zeroAddress, zeroHash } from 'viem'
import { addLiquidity, getQuoteToken, removeLiquidity } from '@clober/v2-sdk'
import BigNumber from 'bignumber.js'
import { Tooltip } from 'react-tooltip'

import { Vault } from '../../model/vault'
import { useChainContext } from '../../contexts/chain-context'
import { useCurrencyContext } from '../../contexts/currency-context'
import { useVaultContractContext } from '../../contexts/vault/vault-contract-context'
import { useVaultContext } from '../../contexts/vault/vault-context'
import { CurrencyIcon } from '../../components/icon/currency-icon'
import { toPlacesAmountString } from '../../utils/bignumber'
import { QuestionMarkSvg } from '../../components/svg/question-mark-svg'
import { AddLiquidityForm } from '../../components/form/vault/add-liquidity-form'
import { RemoveLiquidityForm } from '../../components/form/vault/remove-liquidity-form'
import { testnetChainIds } from '../../constants/chain'
import { VaultDashboardContainer } from '../chart/vault-dashboard-container'
import { WHITELISTED_VAULTS } from '../../constants/vault'

import { VaultChartContainer } from './vault-chart-container'

export const VaultManagerContainer = ({
  vault,
  showDashboard,
}: {
  vault: Vault
  showDashboard: boolean
}) => {
  const [tab, setTab] = React.useState<'add-liquidity' | 'remove-liquidity'>(
    'add-liquidity',
  )
  const router = useRouter()
  const { data: walletClient } = useWalletClient()
  const { selectedChain } = useChainContext()
  const hashDashboard =
    WHITELISTED_VAULTS[selectedChain.id].find(
      (v) => v.key.toLowerCase() === vault.key.toLowerCase(),
    )?.hasDashboard ?? false
  const { balances, prices } = useCurrencyContext()
  const {
    currency0Amount,
    setCurrency0Amount,
    currency1Amount,
    setCurrency1Amount,
    disableSwap,
    setDisableSwap,
    slippageInput,
    setSlippageInput,
    lpCurrencyAmount,
    setLpCurrencyAmount,
    vaultLpBalances,
  } = useVaultContext()
  const { mint, burn } = useVaultContractContext()
  const [showPnL, setShowPnL] = React.useState(true)
  const previousValues = useRef({
    currency0Amount,
    currency1Amount,
  })

  const { data: receiveLpAmount } = useQuery({
    queryKey: [
      'calculate-receive-lp-amount',
      selectedChain.id,
      vault.key,
      currency0Amount,
      currency1Amount,
      disableSwap,
      slippageInput,
      tab,
    ],
    queryFn: async () => {
      if (tab === 'remove-liquidity') {
        return 0n
      }
      if (Number(currency0Amount) === 0 && Number(currency1Amount) === 0) {
        return 0n
      }
      const baseCurrency = isAddressEqual(
        getQuoteToken({
          chainId: selectedChain.id,
          token0: vault.currency0.address,
          token1: vault.currency1.address,
        }),
        vault.currency0.address,
      )
        ? vault.currency1
        : vault.currency0

      const { result } = await addLiquidity({
        chainId: selectedChain.id,
        token0: vault.currency0.address,
        token1: vault.currency1.address,
        salt: zeroHash,
        userAddress: zeroAddress,
        amount0: currency0Amount,
        amount1: currency1Amount,
        options: {
          useSubgraph: false,
          gasLimit: 1_000_000n,
          disableSwap,
          slippage: Number(slippageInput),
          testnetPrice: prices[baseCurrency.address] ?? 0,
        },
      })
      return parseUnits(
        result.lpCurrency.amount,
        result.lpCurrency.currency.decimals,
      )
    },
    initialData: 0n,
  })

  const { data: receiveCurrencies } = useQuery({
    queryKey: [
      'calculate-receive-currencies',
      selectedChain.id,
      vault,
      lpCurrencyAmount,
      slippageInput,
      prices,
      tab,
    ],
    queryFn: async () => {
      if (tab === 'add-liquidity' || Number(lpCurrencyAmount) === 0) {
        return []
      }
      const { result } = await removeLiquidity({
        chainId: selectedChain.id,
        userAddress: zeroAddress,
        token0: vault.currency0.address,
        token1: vault.currency1.address,
        salt: zeroHash,
        amount: lpCurrencyAmount,
        options: {
          useSubgraph: false,
          gasLimit: 1_000_000n,
          slippage: Number(slippageInput),
        },
      })
      return [result.currencyA, result.currencyB]
    },
    initialData: [],
  })

  useEffect(() => {
    setDisableSwap(vault.reserve0 + vault.reserve1 === 0)
  }, [vault.reserve0, vault.reserve1, setDisableSwap])

  useEffect(() => {
    if (testnetChainIds.includes(selectedChain.id)) {
      setDisableSwap(true)
    }
  }, [selectedChain.id, setDisableSwap, currency0Amount, currency1Amount])

  useEffect(() => {
    setCurrency0Amount('')
    setCurrency1Amount('')
  }, [setCurrency0Amount, setCurrency1Amount, disableSwap])

  useEffect(
    () => {
      if (disableSwap && vault.reserve0 + vault.reserve1 > 0) {
        // when change currency0Amount
        if (previousValues.current.currency0Amount !== currency0Amount) {
          const _currency1Amount = new BigNumber(currency0Amount)
            .div(vault.reserve0)
            .times(vault.reserve1)
            .toFixed()
          setCurrency1Amount(
            new BigNumber(_currency1Amount).isNaN() ? '0' : _currency1Amount,
          )
          previousValues.current = {
            currency0Amount,
            currency1Amount: new BigNumber(_currency1Amount).isNaN()
              ? '0'
              : _currency1Amount,
          }
        }
        // when change currency1Amount
        else if (previousValues.current.currency1Amount !== currency1Amount) {
          const _currency0Amount = new BigNumber(currency1Amount)
            .div(vault.reserve1)
            .times(vault.reserve0)
            .toFixed()
          setCurrency0Amount(
            new BigNumber(_currency0Amount).isNaN() ? '0' : _currency0Amount,
          )
          previousValues.current = {
            currency0Amount: new BigNumber(_currency0Amount).isNaN()
              ? '0'
              : _currency0Amount,
            currency1Amount,
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency0Amount, currency1Amount],
  )

  const latestValue = useMemo(
    () =>
      vault.historicalPriceIndex.length > 0
        ? vault.historicalPriceIndex[vault.historicalPriceIndex.length - 1]
            .values[1]
        : 0,
    [vault.historicalPriceIndex],
  )

  return (
    <div className="flex w-full h-full justify-center mt-8 mb-[30px] md:mb-20">
      <div className="w-full lg:w-[992px] h-full flex flex-col items-start gap-8 md:gap-12 px-4 lg:px-0">
        <div className="flex w-full h-full items-center">
          <button
            onClick={() => router.push(`/earn?chain=${selectedChain.id}`)}
            className="flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 32 32"
              fill="none"
              className="mr-auto w-6 h-6 md:w-8 md:h-8"
            >
              <path
                d="M6.66699 16.0003H25.3337M6.66699 16.0003L12.0003 21.3337M6.66699 16.0003L12.0003 10.667"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="absolute left-1/2">
            <div className="flex items-center relative -left-1/2 w-full h-full gap-2 md:gap-4">
              <div className="w-10 h-6 md:w-14 md:h-8 shrink-0 relative">
                <CurrencyIcon
                  currency={vault.currency0}
                  className="w-6 h-6 md:w-8 md:h-8 absolute left-0 top-0 z-[1] rounded-full"
                />
                <CurrencyIcon
                  currency={vault.currency1}
                  className="w-6 h-6 md:w-8 md:h-8 absolute left-4 md:left-6 top-0 rounded-full"
                />
              </div>

              <div className="flex justify-center items-start gap-1 md:gap-2">
                <div className="text-center text-white md:text-3xl font-bold">
                  {vault.currency0.symbol}
                </div>
                <div className="text-center text-white md:text-3xl font-bold">
                  -
                </div>
                <div className="text-center text-white md:text-3xl font-bold">
                  {vault.currency1.symbol}
                </div>
              </div>

              {hashDashboard && (
                <button
                  onClick={() =>
                    showDashboard
                      ? router.push(
                          `/earn/${vault.key}?chain=${selectedChain.id}`,
                        )
                      : router.push(
                          `/earn/${vault.key}/dashboard?chain=${selectedChain.id}`,
                        )
                  }
                  className="hidden lg:flex w-full h-8 px-3 py-2 bg-blue-500 rounded-lg justify-center items-center gap-1"
                  rel="noreferrer"
                >
                  <div className="grow shrink basis-0 opacity-90 text-center text-white text-sm font-bold">
                    {showDashboard ? 'Add Liquidity' : 'Dashboard'}
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {showDashboard ? (
          <VaultDashboardContainer vault={vault} />
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-8 self-stretch text-white">
            <div className="flex flex-col w-full sm:w-[480px] items-start gap-8 md:gap-12">
              <div className="flex flex-col item-st gap-3 md:gap-4 self-stretch">
                <div className="text-white text-sm md:text-base font-bold">
                  Reserve
                </div>
                <div className="flex h-14 px-4 sm:px-8 py-4 bg-gray-800 rounded-xl justify-center items-center gap-8 md:gap-12">
                  <div className="flex justify-center gap-2 md:gap-4">
                    <div className="flex items-center gap-1 md:gap-2">
                      <CurrencyIcon
                        currency={vault.currency0}
                        className="w-5 h-5 md:w-6 md:h-6 rounded-full"
                      />
                      <div className="text-center text-gray-400 text-sm md:text-base font-semibold">
                        {vault.currency0.symbol}
                      </div>
                    </div>
                    <div className="text-center text-white text-sm md:text-lg font-bold ">
                      {toPlacesAmountString(
                        vault.reserve0.toString(),
                        prices[vault.currency0.address] ?? 0,
                      )}
                    </div>
                  </div>
                  <div className="flex justify-center gap-2 md:gap-4">
                    <div className="flex items-center gap-1 md:gap-2">
                      <CurrencyIcon
                        currency={vault.currency1}
                        className="w-5 h-5 md:w-6 md:h-6 rounded-full"
                      />
                      <div className="text-center text-gray-400 text-sm md:text-base font-semibold">
                        {vault.currency1.symbol}
                      </div>
                    </div>
                    <div className="text-center text-white text-sm md:text-lg font-bold ">
                      {toPlacesAmountString(
                        vault.reserve1.toString(),
                        prices[vault.currency1.address] ?? 0,
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex sm:hidden flex-col item-st gap-3 md:gap-4 self-stretch">
                <div className="flex flex-row gap-2">
                  <div className="text-white text-sm md:text-base font-bold">
                    Relative Price Index(RPI)
                  </div>
                  <div className="flex mr-auto justify-center items-center">
                    <QuestionMarkSvg
                      data-tooltip-id="rpi-info"
                      data-tooltip-place="bottom-end"
                      data-tooltip-html={
                        'Relative Price Index (RPI) measures the historical performance of the Clober Liquidity Vault compared to a reference portfolio. The reference portfolio represents the value of assets if they had been held without any active management from the initial point. RPI effectively indicates how well the vault has performed relative to a passive “just hold” strategy.'
                      }
                      className="w-3 h-3"
                    />
                    <Tooltip
                      id="rpi-info"
                      className="max-w-[300px] bg-gray-950 !opacity-100 z-[100]"
                      clickable
                    />
                  </div>
                </div>
                <div className="text-sm font-semibold flex h-14 px-8 py-4 bg-gray-800 rounded-xl justify-center items-center gap-8 md:gap-12">
                  {testnetChainIds.includes(selectedChain.id)
                    ? '-'
                    : latestValue.toFixed(4)}
                </div>
              </div>
              <div className="flex-col items-start gap-3 md:gap-4 self-stretch hidden sm:flex">
                <div className="flex flex-col gap-0.5">
                  <div className="text-white text-sm md:text-base font-bold flex flex-row gap-1 items-center justify-center">
                    <button onClick={() => setShowPnL(!showPnL)}>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="13"
                        height="12"
                        viewBox="0 0 13 12"
                        fill="none"
                      >
                        <g clipPath="url(#clip0_164_5640)">
                          <path
                            d="M10.6304 8.5H1.63037M10.6304 8.5L9.13037 10M10.6304 8.5L9.13037 7M3.13037 5L1.63037 3.5M1.63037 3.5L3.13037 2M1.63037 3.5H10.6304"
                            stroke="#3B82F6"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                        <defs>
                          <clipPath id="clip0_164_5640">
                            <rect
                              width="12"
                              height="12"
                              fill="white"
                              transform="translate(0.130371)"
                            />
                          </clipPath>
                        </defs>
                      </svg>
                    </button>
                    Historical Performance
                  </div>
                  <div className="flex flex-row gap-2">
                    <div className="flex text-gray-500 text-xs md:text-sm">
                      {showPnL
                        ? 'Relative Price Index(RPI)'
                        : 'Performance Index (PI)'}
                    </div>
                    <div className="flex mr-auto justify-center items-center z-50">
                      <QuestionMarkSvg
                        data-tooltip-id="index-info"
                        data-tooltip-place="bottom-end"
                        data-tooltip-html={
                          showPnL
                            ? 'Relative Price Index (RPI) measures the historical performance of the Clober Liquidity Vault compared to a reference portfolio. The reference portfolio represents the value of assets if they had been held without any active management from the initial point. RPI effectively indicates how well the vault has performed relative to a passive “just hold” strategy.'
                            : 'Performance Index (PI) shows the relative value of your portfolio over time, starting at 1. A value above 1 indicates growth, while a value below 1 indicates a decrease. PI provides a snapshot of how the assets have performed since the initial measurement.'
                        }
                        className="w-3 h-3"
                      />
                      <Tooltip
                        id="index-info"
                        className="max-w-[300px] bg-gray-950 !opacity-100 z-[100]"
                        clickable
                      />
                    </div>
                  </div>
                </div>
                <VaultChartContainer
                  historicalPriceIndex={
                    testnetChainIds.includes(selectedChain.id)
                      ? []
                      : vault.historicalPriceIndex
                  }
                  showPnL={showPnL}
                />
              </div>
            </div>
            <div className="h-full md:h-[576px] flex flex-col w-full sm:w-[480px] justify-start items-start gap-4">
              <div className="w-full sm:h-14 p-1.5 sm:px-2 rounded-xl md:rounded-2xl border-2 border-slate-800 border-solid justify-center items-center inline-flex">
                <button
                  disabled={tab === 'add-liquidity'}
                  onClick={() => setTab('add-liquidity')}
                  className="whitespace-nowrap flex-1 h-8 sm:h-10 px-4 sm:px-6 py-1.5 sm:py-4 disabled:bg-slate-800 rounded-xl justify-center items-center gap-1 sm:gap-2 flex"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="w-4 h-4 md:w-5 md:h-5"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18ZM11 6C11 5.44772 10.5523 5 10 5C9.44772 5 9 5.44772 9 6V9H6C5.44772 9 5 9.44772 5 10C5 10.5523 5.44772 11 6 11H9V14C9 14.5523 9.44772 15 10 15C10.5523 15 11 14.5523 11 14V11H14C14.5523 11 15 10.5523 15 10C15 9.44772 14.5523 9 14 9H11V6Z"
                      fill="white"
                    />
                  </svg>
                  <div className="opacity-90 text-center text-gray-400 text-sm md:text-base font-bold">
                    Add Liquidity
                  </div>
                </button>
                <button
                  disabled={tab === 'remove-liquidity'}
                  onClick={() => setTab('remove-liquidity')}
                  className="whitespace-nowrap flex-1 h-8 sm:h-10 px-4 sm:px-6 py-1.5 sm:py-4 disabled:bg-slate-800 rounded-xl justify-center items-center gap-1 sm:gap-2 flex"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="w-4 h-4 md:w-5 md:h-5"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18ZM6 9C5.44772 9 5 9.44772 5 10C5 10.5523 5.44772 11 6 11H14C14.5523 11 15 10.5523 15 10C15 9.44772 14.5523 9 14 9H6Z"
                      fill="#9CA3AF"
                    />
                  </svg>
                  <div className="opacity-90 text-center text-gray-400 text-sm md:text-base font-bold">
                    Remove Liquidity
                  </div>
                </button>
              </div>
              <div className="p-6 bg-gray-900 rounded-2xl border flex-col justify-start items-start gap-6 md:gap-8 flex w-full">
                {tab === 'add-liquidity' ? (
                  <AddLiquidityForm
                    chainId={selectedChain.id}
                    vault={vault}
                    prices={prices}
                    currency0Amount={currency0Amount}
                    setCurrency0Amount={setCurrency0Amount}
                    availableCurrency0Balance={
                      balances[vault.currency0.address] ?? 0n
                    }
                    currency1Amount={currency1Amount}
                    setCurrency1Amount={setCurrency1Amount}
                    availableCurrency1Balance={
                      balances[vault.currency1.address] ?? 0n
                    }
                    disableSwap={disableSwap}
                    setDisableSwap={setDisableSwap}
                    disableDisableSwap={
                      vault.reserve0 + vault.reserve1 === 0 ||
                      testnetChainIds.includes(selectedChain.id)
                    }
                    slippageInput={slippageInput}
                    setSlippageInput={setSlippageInput}
                    receiveLpCurrencyAmount={receiveLpAmount}
                    isCalculatingReceiveLpAmount={
                      (disableSwap &&
                        Number(currency0Amount) > 0 &&
                        Number(currency1Amount) > 0 &&
                        receiveLpAmount === 0n) ||
                      (!disableSwap &&
                        Number(currency0Amount) + Number(currency1Amount) > 0 &&
                        receiveLpAmount === 0n)
                    }
                    actionButtonProps={{
                      disabled:
                        !walletClient ||
                        (Number(currency0Amount) === 0 &&
                          Number(currency1Amount) === 0) ||
                        parseUnits(currency0Amount, vault.currency0.decimals) >
                          balances[vault.currency0.address] ||
                        parseUnits(currency1Amount, vault.currency1.decimals) >
                          balances[vault.currency1.address] ||
                        (disableSwap &&
                          (Number(currency0Amount) === 0 ||
                            Number(currency1Amount) === 0)),
                      onClick: async () => {
                        await mint(
                          vault.currency0,
                          vault.currency1,
                          currency0Amount,
                          currency1Amount,
                          vault.reserve0 + vault.reserve1 > 0
                            ? disableSwap
                            : true,
                          Number(slippageInput),
                        )
                      },
                      text: !walletClient
                        ? 'Connect wallet'
                        : Number(currency0Amount) === 0 &&
                            Number(currency1Amount) === 0
                          ? 'Enter amount'
                          : parseUnits(
                                currency0Amount,
                                vault.currency0.decimals,
                              ) > balances[vault.currency0.address]
                            ? `Insufficient ${vault.currency0.symbol} balance`
                            : parseUnits(
                                  currency1Amount,
                                  vault.currency1.decimals,
                                ) > balances[vault.currency1.address]
                              ? `Insufficient ${vault.currency1.symbol} balance`
                              : disableSwap &&
                                  (Number(currency0Amount) === 0 ||
                                    Number(currency1Amount) === 0)
                                ? `Enter amount`
                                : `Add Liquidity`,
                    }}
                  />
                ) : (
                  <RemoveLiquidityForm
                    vault={vault}
                    prices={{
                      ...prices,
                      [vault.lpCurrency.address]: vault.lpUsdValue,
                    }}
                    lpCurrencyAmount={lpCurrencyAmount}
                    setLpCurrencyAmount={setLpCurrencyAmount}
                    availableLpCurrencyBalance={
                      vaultLpBalances[vault.key] ?? 0n
                    }
                    receiveCurrencies={
                      receiveCurrencies.length === 2
                        ? [
                            {
                              currency: receiveCurrencies[0].currency,
                              amount: parseUnits(
                                receiveCurrencies[0].amount,
                                receiveCurrencies[0].currency.decimals,
                              ),
                            },
                            {
                              currency: receiveCurrencies[1].currency,
                              amount: parseUnits(
                                receiveCurrencies[1].amount,
                                receiveCurrencies[1].currency.decimals,
                              ),
                            },
                          ]
                        : [
                            {
                              currency: vault.currency0,
                              amount: 0n,
                            },
                            {
                              currency: vault.currency1,
                              amount: 0n,
                            },
                          ]
                    }
                    slippageInput={slippageInput}
                    setSlippageInput={setSlippageInput}
                    isCalculatingReceiveCurrencies={
                      Number(lpCurrencyAmount) > 0 &&
                      receiveCurrencies.length === 0
                    }
                    actionButtonProps={{
                      disabled:
                        !walletClient ||
                        Number(lpCurrencyAmount) === 0 ||
                        parseUnits(lpCurrencyAmount, 18) >
                          vaultLpBalances[vault.key],
                      onClick: async () => {
                        await burn(
                          vault.currency0,
                          vault.currency1,
                          lpCurrencyAmount,
                          slippageInput,
                        )
                      },
                      text: !walletClient
                        ? 'Connect wallet'
                        : Number(lpCurrencyAmount) === 0
                          ? 'Enter amount'
                          : parseUnits(lpCurrencyAmount, 18) >
                              vaultLpBalances[vault.key]
                            ? `Insufficient ${vault.lpCurrency.symbol} balance`
                            : `Remove Liquidity`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
