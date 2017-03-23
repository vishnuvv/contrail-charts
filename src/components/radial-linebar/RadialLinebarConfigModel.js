/*
 * Copyright (c) 2016 Juniper Networks, Inc. All rights reserved.
 */
import * as d3Scale from 'd3-scale'
import * as d3Ease from 'd3-ease'
import * as d3Shape from 'd3-shape'
import _ from 'lodash'
import ContrailChartsConfigModel from 'contrail-charts-config-model'

export default class RadialLinebarConfigModel extends ContrailChartsConfigModel {
  get defaults () {
    return {
      // The chart width. If not provided will be caculated by View.
      chartWidth: undefined,

      // The chart height. If not provided will be caculated by View.
      chartHeight: undefined,

      colorScale: d3Scale.scaleOrdinal(d3Scale.schemeCategory20),

      // The duration of transitions.
      ease: d3Ease.easeCubic,
      duration: 500,

      // curve: d3Shape.curveBundle.beta(0.85)
      // curve: d3Shape.curveBundle.beta(0.95)
      // curve: d3Shape.curveBundle.beta(1)
      curve: d3Shape.curveCatmullRom.alpha(0.5),
      // curve: d3Shape.curveCatmullRom.alpha(0.75)
      // curve: d3Shape.curveCatmullRom.alpha(1)
      // curve: d3Shape.curveLinear

      onClickNode: data => {},
      onClickLink: data => {},
      onDblClickLink: data => {},
      onDblClickNode: data => {}
    }
  }

  initialize (p) {
    // User should provide colorScheme instead of colorScale. it can be always overridden. if colorScale is not provided, lets use the colorScheme to create one.
    if (!this.attributes.colorScale && p.colorScheme) this.attributes.colorScale = d3Scale.scaleOrdinal(p.colorScheme)
  }

  getColor (data, accessor) {
    return accessor.color || this.attributes.colorScale(accessor.accessor)
  }

  getAccessors () {
    return this.get('plot').r
  }
}
