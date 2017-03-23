/*
 * Copyright (c) Juniper Networks, Inc. All rights reserved.
 */
import {ChartView} from 'coCharts'
import {formatter} from 'commons'

const dataSrc = []
for (let i = 0; i < 100; i++) {
  const a = Math.random() * 100
  dataSrc.push({
    x: 1475760930000 + 1000000 * i,
    a: a,
    b: a + Math.random() * 10,
    c: Math.random() * 100,
    d: i + (Math.random() - 0.5) * 10,
    e: (Math.random() - 0.5) * 10
  })
}

const chartConfig = {
  id: 'chartBox',
  components: [{
    type: 'LegendPanel',
    config: {
      sourceComponent: 'radial-linebar-chart-id',
      editable: {
        colorSelector: true,
        chartSelector: false
      },
      placement: 'horizontal',
      filter: true
    }
  }, {
    id: 'radial-linebar-chart-id',
    type: 'RadialLinebar',
    config: {
      plot: {
        x: {
          accessor: 'x'
        },
        r: [{
          accessor: 'd',
          axis: 'r',
          domain: [-5, undefined]
        },
        {
          accessor: 'a'
        }]
      },
      axis: {
        r: {
          formatter: formatter.toInteger
        }
      },
      tooltip: 'tooltip-id'
    }
  }, {
    id: 'tooltip-id',
    type: 'Tooltip',
    config: {
      formatter: (data) => {
        const type = ['Virtual Network', 'IP', 'Port']
        let content = {title: data.name, items: []}
        content.items.push({
          label: 'Type',
          value: type[data.level - 1]
        }, {
          label: 'Flow Count',
          value: data.children.length
        })
        return content
      }
    }
  }
  ]
}

const chart = new ChartView()

export default {
  render: () => {
    chart.setConfig(chartConfig)
    chart.setData(dataSrc)
  },
  remove: () => {
    chart.remove()
  }
}
