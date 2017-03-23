/*
 * Copyright (c) 2016 Juniper Networks, Inc. All rights reserved.
 */
import './radial-linebar.scss'
import _ from 'lodash'
import * as d3Scale from 'd3-scale'
import * as d3Selection from 'd3-selection'
import * as d3Shape from 'd3-shape'
import ContrailChartsView from 'contrail-charts-view'
import actionman from 'core/Actionman'

export default class RadialLinebarView extends ContrailChartsView {
  static get dataType () { return 'Serie' }

  constructor (p) {
    super(p)
    this.listenTo(this.model, 'change', this._onDataModelChange)
    this.listenTo(this.config, 'change', this._onConfigModelChange)
    /**
     * Let's bind super _onResize to this. Also .bind returns new function ref.
     * we need to store this for successful removal from window event
     */
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  get tagName () { return 'g' }

  get selectors () {
    return _.extend(super.selectors, {
      node: '.arc',
      link: '.ribbon',
      active: '.active'
    })
  }
  get events () {
    return _.extend(super.events, {
      [`click ${this.selectors.link}`]: '_onClickLink',
      [`dblclick ${this.selectors.link}`]: '_onDblClickLink',
      [`dblclick ${this.selectors.node}`]: '_onDblClickNode',
      [`mousemove ${this.selectors.node}`]: '_onMousemove',
      [`mouseout ${this.selectors.node}`]: '_onMouseout'
    })
  }

  render () {
    this.resetParams()
    this._calculateDimensions()
    this._initializePlot()
    this._initializeAxis()
    this._calculateScales()
    this._prepareRTicks()
    super.render()
    this._renderRTicks()
    this._renderRAxis()
    this._render()
    this._ticking = false
  }

  remove () {
    super.remove()
    window.removeEventListener('resize', this._onResize)
  }

  _calculateDimensions () {
    if (!this.params.chartWidth) {
      this.params.chartWidth = this._container.getBoundingClientRect().width
    }
    if (this.params.chartWidthDelta) {
      this.params.chartWidth += this.params.chartWidthDelta
    }
    if (!this.params.chartHeight) {
      this.params.chartHeight = this.params.chartWidth
    }
    if (!this.params.margin) {
      this.params.margin = 25
    }
    if (!this.params.radius) {
      this.params.radius = (this.params.chartWidth / 2) - this.params.margin
    }
    if (!this.params.innerRadius) {
      this.params.innerRadius = 0.1 * this.params.radius
    }
  }

  _initializePlot () {
    const plot = this.params.plot
    if (!plot.x.axis) {
      // Default x axis name (the perimeter).
      plot.x.axis = 'x'
    }
    _.each(plot.r, accessor => {
      if (!accessor.axis) {
        // Default r axis name.
        accessor.axis = 'r'
      }
      // if accessor is not set to disabled treat it as enabled
      if (!_.has(accessor, 'enabled')) {
        accessor.enabled = true
      }
    })
  }

  _initializeAxis () {
    if (!this.params.axis) {
      this.params.axis = {}
    }
    const xAccessor = this.params.plot.x
    if (!this.params.axis[xAccessor.axis]) {
      this.params.axis[xAccessor.axis] = {}
    }
    _.each(this.params.plot.r, (rAccessor) => {
      if (!this.params.axis[rAccessor.axis]) {
        this.params.axis[rAccessor.axis] = {}
      }
    })
  }

  _calculateScales () {
    const xAccessor = this.params.plot.x
    const rAccessors = this.params.plot.r
    const allAccessorNames = _.concat([xAccessor.accessor], _.map(rAccessors, 'accessor'))
    const domains = {}
    _.each(this.model.data, (d) => {
      _.each(allAccessorNames, (accessorName) => {
        if (!domains[accessorName]) {
          domains[accessorName] = [d[accessorName], d[accessorName]]
        }
        else {
          if (d[accessorName] < domains[accessorName][0]) {
            domains[accessorName][0] = d[accessorName]
          }
          else if (d[accessorName] > domains[accessorName][1]) {
            domains[accessorName][1] = d[accessorName]
          }
        }
      })
    })
    console.log('domains: ', domains)
    // Domains and scales calculated from data.
    this.params.domains = domains
    // Now merge this with config.
    this.mergeAccessorDomain(xAccessor)
    _.each(rAccessors, (rAccessor) => {
      this.mergeAccessorDomain(rAccessor)
    })
    // Save scales
    xAccessor.scale = d3Scale.scaleLinear().domain(xAccessor.domain).range([0, 2 * Math.PI])
    this.params.axis[xAccessor.axis].scale = xAccessor.scale
    _.each(rAccessors, (rAccessor) => {
      rAccessor.scale = d3Scale.scaleLinear().domain(rAccessor.domain).range([this.params.innerRadius, this.params.radius])
      this.params.axis[rAccessor.axis].scale = rAccessor.scale
    })
  }

  /**
  * Helper function that merges the given accessor domain with the calculated values.
  */
  mergeAccessorDomain (accessor) {
    if (!_.isArray(accessor.domain) || accessor.domain.length !== 2) {
      accessor.domain = [undefined, undefined]
    }
    if (!_.isFinite(accessor.domain[0])) {
      accessor.domain[0] = this.params.domains[accessor.accessor][0]
    }
    if (!_.isFinite(accessor.domain[1])) {
      accessor.domain[1] = this.params.domains[accessor.accessor][1]
    }
  }

  _prepareRTicks () {
    // The first enabled r accessor is the reference.
    const referenceAccessor = _.find(this.params.plot.r, { enabled: true })
    if (!referenceAccessor) {
      return
    }
    let numOfTicks = 10
    if (this.hasAxisParam(referenceAccessor.axis, 'ticks')) {
      numOfTicks = this.params.axis[referenceAccessor.axis].ticks
    }
    const referenceTicks = referenceAccessor.scale.ticks(numOfTicks)
    this.params.axis.referenceRadius = []
    _.each(referenceTicks, (referenceTick) => {
      this.params.axis.referenceRadius.push(referenceAccessor.scale(referenceTick))
    })
  }

  _renderRTicks () {
    if (this.d3.select('.axis').empty()) {
      this.d3.append('g').attr('class', 'axis')
    }
    if (!this.params.axis.referenceRadius) {
      return
    }
    const svgRefrenceTicks = this.d3.select('.axis').selectAll('.radius-tick').data(this.params.axis.referenceRadius)
    const svgRefrenceTicksEnter = svgRefrenceTicks.enter().append('circle')
      .attr('class', 'radius-tick')
      .attr('r', 0)
    const svgRefrenceTicksEdit = svgRefrenceTicksEnter.merge(svgRefrenceTicks).transition().ease(this.config.get('ease')).duration(this.params.duration)
      .attr('r', (d) => d)
    svgRefrenceTicks.exit().remove()
  }

  _renderRAxis () {
    const xAccessor = this.params.plot.x
    const enabledRAccesors = _.filter(this.params.plot.r, { enabled: true })
    let numOfTicks = 10
    if (this.hasAxisParam(xAccessor.axis, 'ticks')) {
      numOfTicks = this.params.axis[xAccessor.axis].ticks
    }
    const xTicks = _.map(xAccessor.scale.ticks(numOfTicks), (xTick) => {
      return {
        x: xTick,
        rMin: this.params.innerRadius,
        rMax: this.params.radius
      }
    })
    const lineGenerator = d3Shape.radialLine().angle((d) => xAccessor.scale(d.x)).radius((d) => d.r)
    const svgRAxis = this.d3.select('.axis').selectAll('.x-tick').data(xTicks)
    const svgRAxisEnter = svgRAxis.enter().append('g')
      .attr('class', (xTick , i) => 'x-tick' + ((i < enabledRAccesors.length) ? ' x-tick-scale' : '') )
    svgRAxisEnter.append('path')
      .attr('d', (d) => {
        const points = [{ x: d.x, r: d.rMin }, { x: d.x, r: d.rMax }]
        return lineGenerator(points)
      })
    const svgRAxisEdit = svgRAxisEnter.merge(svgRAxis).transition().ease(this.config.get('ease')).duration(this.params.duration)
      .attr('class', (xTick , i) => 'x-tick' + ((i < enabledRAccesors.length) ? ' x-tick-scale' : '') )
    svgRAxisEdit.select('path')
      .attr('d', (d) => {
        const points = [{ x: d.x, r: d.rMin }, { x: d.x, r: d.rMax }]
        return lineGenerator(points)
      })
    svgRAxis.exit().remove()

    const ticksData = []
    _.each(enabledRAccesors, (rAccessor, i) => {
      _.each(this.params.axis.referenceRadius, (refR) => {
        let value = rAccessor.scale.invert(refR)
        if (this.config.get('axis')[rAccessor.axis].formatter) {
          value = this.config.get('axis')[rAccessor.axis].formatter(value)
        }
        ticksData.push({
          x: refR * Math.cos(xAccessor.scale(xTicks[i].x) - Math.PI / 2),
          y: refR * Math.sin(xAccessor.scale(xTicks[i].x) - Math.PI / 2),
          value: value
        })
      })
    })
    console.log('ticksData: ', ticksData)
    const svgRAxisTicks = this.d3.select('.axis').selectAll('.radius-tick-text').data(ticksData)
    const svgRAxisTicksEnter = svgRAxisTicks.enter().append('text')
      .attr('class', 'radius-tick-text')
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .text((d) => d.value)
    const svgRAxisTicksEdit = svgRAxisTicksEnter.merge(svgRAxisTicks).transition().ease(this.config.get('ease')).duration(this.params.duration)
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .text((d) => d.value)
    svgRAxisTicks.exit().remove()
  }

  hasAxisConfig (axisName, axisAttributeName) {
    const axis = this.config.get('axis')
    return _.isObject(axis) && _.isObject(axis[axisName]) && !_.isUndefined(axis[axisName][axisAttributeName])
  }

  hasAxisParam (axisName, axisAttributeName) {
    return _.isObject(this.params.axis) && _.isObject(this.params.axis[axisName]) && !_.isUndefined(this.params.axis[axisName][axisAttributeName])
  }

  _render () {
    console.log('params: ', this.params)
    const enabledRAccesors = _.filter(this.params.plot.r, { enabled: true })
    this.d3.attr('transform', `translate(${this.params.chartWidth / 2}, ${this.params.chartHeight / 2})`)
    // Draw inner and outer circle.
    /*
    const radiusArray = [this.params.innerRadius, this.params.radius]
    const svgCircles = this.d3.selectAll(`.circle`).data(radiusArray)
    const svgCirclesEnter = svgCircles.enter().append('circle')
      .attr('class', 'circle')
      .attr('r', 0)
    const svgCircleEdit = svgCirclesEnter.merge(svgCircles).transition().ease(this.config.get('ease')).duration(this.params.duration)
      .attr('r', (d) => d)
    */
    // Draw lines
    const xAccessor = this.params.plot.x
    const lineGenerator = d3Shape.radialLine().curve(this.config.get('curve')).angle((d) => xAccessor.scale(d[xAccessor.accessor]))
    const svgLine = this.d3.selectAll(`.line`).data(enabledRAccesors)
    const svgLineEnter = svgLine.enter().append('path')
      .attr('class', (rAccessor) => `line ${rAccessor.accessor}`)
      .style('stroke', (rAccessor) => this.config.getColor(null, rAccessor))
      .attr('d', (rAccessor) => {
        const accessorLineGenerator = lineGenerator.radius((d) => rAccessor.scale(d[rAccessor.accessor]))
        return accessorLineGenerator(this.model.data)
      })
    const svgLineEdit = svgLineEnter.merge(svgLine).transition().ease(this.config.get('ease')).duration(this.params.duration)
      .style('stroke', (rAccessor) => this.config.getColor(null, rAccessor))
      .attr('d', (rAccessor) => {
        const accessorLineGenerator = lineGenerator.radius((d) => rAccessor.scale(d[rAccessor.accessor]))
        return accessorLineGenerator(this.model.data)
      })
    svgLine.exit().remove()
  }

  // Event handlers

  _onDataModelChange () {
    this.render()
  }

  _onConfigModelChange () {
    this.render()
  }

  _onMousemove (d, el) {
    const leaves = d.leaves()
    _.each(this.ribbons, (ribbon) => {
      ribbon.active = Boolean(_.find(leaves, (leaf) => leaf.data.linkId === ribbon.id))
    })
    this._render()
    const [left, top] = d3Selection.mouse(this._container)
    actionman.fire('ShowComponent', this.config.get('tooltip'), {left, top}, d.data)
  }

  _onMouseout (d, el) {
    _.each(this.ribbons, (ribbon) => {
      ribbon.active = false
    })
    this._render()
    actionman.fire('HideComponent', this.config.get('tooltip'))
  }

  _onClickNode (d, el) {
    if (d.depth < this.maxDepth && d.depth === this.params.drillDownLevel) {
      // Expand
      this.config.set('drillDownLevel', this.params.drillDownLevel + 1)
    } else if (d.depth < this.params.drillDownLevel) {
      // Collapse
      this.config.set('drillDownLevel', this.params.drillDownLevel - 1)
    }
    el.classList.remove(this.selectorClass('active'))
    this.config.get('onClickNode')(d.data)
  }

  _onClickLink (d, el) {
    this.config.get('onClickLink')(d.data)
  }

  _onDblClickLink (d, el) {
    this.config.get('onDblClickLink')(d.data)
  }

  _onDblClickNode (d, el) {
    this.config.get('onDblClickNode')(d.data)
  }
}
