import React, { useMemo } from 'react'
import { TamaguiProvider } from '@tamagui/web'

import tamaguiConfig from '../../tamagui.config'
import { toHumanReadableString } from '../../utils/number'

import { Chart } from './chart-model'
import { CustomVolumeChartModel } from './volume/custom-volume-chart-model'
import { StackedHistogramData } from './volume/renderer'
import { ChartHeader } from './chart-header'

export const HistogramChart = ({
  data,
  totalKey,
  colors,
  detailData,
  height,
}: {
  data: StackedHistogramData[]
  totalKey: string
  colors: string[]
  detailData: { label: string; color: string }[]
  height: number
}) => {
  const params = {
    data,
    colors,
    background: '#FFFFFF',
  }
  const last = useMemo(
    () =>
      data[data.length - 1].values[
        totalKey as keyof StackedHistogramData['values']
      ] ?? 0,
    [data, totalKey],
  )

  return (
    <TamaguiProvider
      config={tamaguiConfig}
      disableInjectCSS
      disableRootThemeClass
    >
      {(() => {
        return (
          <Chart
            Model={CustomVolumeChartModel<StackedHistogramData>}
            params={params as any}
            height={height}
          >
            {(crosshairData) => {
              return (
                <ChartHeader
                  value={
                    crosshairData
                      ? toHumanReadableString(
                          crosshairData.values[totalKey] ?? 0,
                        )
                      : toHumanReadableString(last)
                  }
                  time={crosshairData?.time}
                  detailData={
                    crosshairData
                      ? detailData.map(({ label, color }) => ({
                          label,
                          value: toHumanReadableString(
                            crosshairData.values[label] ?? 0,
                          ),
                          color,
                        }))
                      : []
                  }
                />
              )
            }}
          </Chart>
        )
      })()}
    </TamaguiProvider>
  )
}
