/*
 * Copyright (c) 2016 Juniper Networks, Inc. All rights reserved.
 */
import * as d3Scale from 'd3-scale'
import * as d3Ease from 'd3-ease'
import * as d3Shape from 'd3-shape'
import _ from 'lodash'
import ContrailChartsConfigModel from 'contrail-charts-config-model'
import ColoredChart from 'helpers/color/ColoredChart'

export default class RadialDendrogramConfigModel extends ContrailChartsConfigModel {
  get defaults () {
    return _.defaultsDeep(super.defaults, ColoredChart.defaults, {

      // The labels of the levels.
      levels: [],

      // The duration of transitions.
      ease: d3Ease.easeCubic,
      duration: 500,

      valueScale: d3Scale.scaleLog(),
      // valueScale: d3Scale.scaleLinear(),

      // The separation in degrees between nodes with different parents
      parentSeparation: 1,
      parentSeparationThreshold: 0,

      // Arc width
      arcWidth: 10,

      // Show arc labels
      showArcLabels: true,

      // Define how will the labels be rendered: 'along-arc', 'perpendicular'
      labelFlow: 'along-arc',

      // Estimated average letter width
      arcLabelLetterWidth: 5,

      // The X offset (in pixels) of the arc label counted from the beggining of the arc.
      arcLabelXOffset: 2,

      // The Y offset (in pixels) of the arc label counted from the outer edge of the arc (positive values offset the label into the center of the circle).
      arcLabelYOffset: 18,

      // Initial drill down level
      drillDownLevel: 1,

      // curve: d3Shape.curveBundle.beta(0.85)
      // curve: d3Shape.curveBundle.beta(0.95)
      // curve: d3Shape.curveBundle.beta(1)
      curve: d3Shape.curveCatmullRom.alpha(0.5),
      // curve: d3Shape.curveCatmullRom.alpha(0.75)
      // curve: d3Shape.curveCatmullRom.alpha(1)
      // curve: d3Shape.curveLinear
    })
  }

  set (...args) {
    ColoredChart.set(...args)
    super.set(...args)
  }

  getColor (accessorName) {
    const configured = _.find(this.accessors, {accessor: accessorName}).color
    return configured || this.attributes.colorScale(accessorName)
  }

  setColor (accessorName, color) {
    const levels = this.get('levels')
    const level = _.find(levels, level => level.level === accessorName)
    if (!level) return
    level.color = color
    this.trigger('change', this.config)
  }

  get accessors () {
    return _.map(this.attributes.levels, level => {
      return {
        accessor: level.level,
        level: level.level,
        label: level.label,
        color: level.color,
        enabled: level.level < this.attributes.drillDownLevel
      }
    })
  }

  setAccessor (accessorName, isEnabled) {
    const levels = this.attributes.levels
    const level = _.find(levels, level => level.level === accessorName)
    if (!level) return
    let drillDownLevel = isEnabled ? level.level + 1 : level.level
    if (drillDownLevel < 1) drillDownLevel = 1
    this.set({drillDownLevel})
  }
}
