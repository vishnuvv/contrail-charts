/*
 * Copyright (c) 2016 Juniper Networks, Inc. All rights reserved.
 */
import _ from 'lodash'
import * as d3Hierarchy from 'd3-hierarchy'
import * as d3Scale from 'd3-scale'
import * as d3Selection from 'd3-selection'
import * as d3Shape from 'd3-shape'
import * as d3Chord from 'd3-chord'
import ContrailChartsView from 'contrail-charts-view'
import actionman from 'core/Actionman'
import './radial-dendrogram.scss'

export default class RadialDendrogramView extends ContrailChartsView {
  static get dataType () { return 'Serie' }

  constructor (p) {
    super(p)
    this.listenTo(this.model, 'change', this._onDataModelChange)
    this.listenTo(this.config, 'change', this._onConfigModelChange)
    /**
     * Let's bind super _onResize to this. Also .bind returns new function ref.
     * we need to store this for successful removal from window event
     */
    this.d3Selection = d3Selection
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
  }

  get tagName () { return 'g' }

  get selectors () {
    return _.extend(super.selectors, {
      node: '.arc',
      link: '.ribbon',
      active: '.active',
    })
  }

  get events () {
    return _.extend(super.events, {
      'click node': '_onClickNode',
      'click link': '_onEvent',
      'dblclick node': '_onEvent',
      'dblclick link': '_onEvent',
      'mousemove node': '_onMousemove',
      'mouseout node': '_onMouseout'
    })
  }

  render () {
    this.resetParams()
    this._calculateDimensions()
    this._prepareHierarchy()
    super.render()
    this._render()
    this._ticking = false
  }

  remove () {
    super.remove()
    window.removeEventListener('resize', this._onResize)
  }

  _calculateDimensions () {
    if (!this.params.width) {
      this.params.width = this._container.getBoundingClientRect().width
    }
    if (this.params.widthDelta) {
      this.params.width += this.params.widthDelta
    }
    if (!this.params.height) {
      this.params.height = this.params.width
    }
    if (!this.params.radius) {
      this.params.radius = this.params.width / 2
    }
    if (!this.params.labelMargin) {
      this.params.labelMargin = 50
    }
    if (!this.params.innerRadius) {
      this.params.innerRadius = this.params.radius - this.params.labelMargin
    }
  }
  /**
  * Build the root node tree structure that will be the input for the d3.hierarchy() layout.
  * We build one more level than configured in order to allow branching of the last configured level.
  */
  _prepareRootNode () {
    const data = this.model.data
    const hierarchyConfig = this.config.get('hierarchyConfig')
    const leafNodes = []
    this.maxDepth = 0
    // The root node of the hierarchy (tree) we are building.
    this.rootNode = {
      name: 'root',
      children: []
    }
    this.valueSum = 0
    _.each(data, (d, index) => {
      // Parsing a data element should return a 2 element array: [source, destination]
      const leafs = hierarchyConfig.parse(d)
      // Check if we havent already created a node pair (link) with the same id.
      const foundSrcNode = _.find(leafNodes, (leafNode) => {
        let found = false
        //If there already exists a leaf node matching the src & dst
        // if (leafNode.type == 'src' && leafNode.id === leafs[0].id) {
        if (leafNode.type == 'src' && leafNode.id === leafs[0].id) {
          if (leafNode.otherNode.id === leafs[1].id) {
            found = true
          }
        }
        if (leafNode.type == 'src' && leafNode.id === leafs[1].id) {
          if (leafNode.otherNode.id === leafs[0].id) {
            found = true
          }
        }
        return found
      })
      //How to ensure for intra traffic
      const foundDstNode = _.find(leafNodes, (leafNode) => {
        let found = false
        //If there already exists a leaf node matching the src & dst
        if (leafNode.type == 'dst' && leafNode.id === leafs[1].id) {
          if (leafNode.otherNode.id === leafs[0].id) {
            found = true
          }
        }
        if (leafNode.type == 'dst' && leafNode.id === leafs[0].id) {
          if (leafNode.otherNode.id === leafs[1].id) {
            found = true
          }
        }
        return found
      })
      var foundLeafNode = null;
      if(foundSrcNode != null)
        foundLeafNode = foundSrcNode;
      else 
        foundLeafNode = foundDstNode;
      if (foundLeafNode) {
        this.valueSum += leafs[0].value + leafs[1].value
        if(foundSrcNode) {
            foundSrcNode.value += foundLeafNode.id === leafs[0].id ? leafs[0].value : leafs[1].value;
            foundSrcNode.otherNode.value += foundLeafNode.otherNode.id === leafs[0].id ? leafs[0].value : leafs[1].value;
            foundSrcNode.dataChildren.push(d);
        }
        if(foundDstNode) {
            foundDstNode.value += foundLeafNode.id === leafs[0].id ? leafs[0].value : leafs[1].value;
            foundDstNode.otherNode.value += foundLeafNode.otherNode.id === leafs[0].id ? leafs[0].value : leafs[1].value;
            foundDstNode.dataChildren.push(d);
        }
      } else {
        _.each(leafs, (leaf, i) => {
          // leaf node contains an array of 'names' (ie. the path from root to leaf) and a 'value'
          let children = this.rootNode.children
          let node = null
          const namePath = []
          let displayLabels = []
          let currLeaf = leaf
          _.each(leaf.names, (name, depth) => {
            this.maxDepth = Math.max(this.maxDepth, depth + 1)
            if (depth >= this.params.drillDownLevel) {
              return
            }
            namePath.push(name)
            if(currLeaf.displayLabels instanceof Array)
            displayLabels.push(currLeaf.displayLabels[depth])
            node = _.find(children, (child) => child.name === name)
            if (!node) {
              node = {
                name: name,
                labelAppend:currLeaf.labelAppend,
                arcType: currLeaf.type,
                namePath: namePath.slice(0),
                displayLabels: displayLabels.slice(0),
                children: [],
                level: depth + 1
              }
              children.push(node)
            }
            children = node.children
          })
          // Now 'node' is one before leaf
          const leafNode = {
            id: leaf.id,
            otherNode: (i === 0) ? leafs[1] : leafs[0],
            currentNode: (i === 0) ? leafs[0] : leafs[1],
            arcType: leaf.type,
            value: leaf.value,
            type: (i === 0) ? 'src' : 'dst',
            linkId: leafs[0].id + '-' + leafs[1].id,
            dataChildren : [d]
          }
          if(node) {
            node.children.push(leafNode)
          }
          this.valueSum += leafNode.value
          leafNodes.push(leafNode)
        })
      }
    })
    // console.log('maxDepth: ', this.maxDepth)
    // console.log('rootNode: ', this.rootNode, this.valueSum)
  }

  _prepareHierarchyRootNode () {
    var zeroDataLinks = 0;
    this.hierarchyRootNode = d3Hierarchy.hierarchy(this.rootNode).each(function (d) {
          // Nodes with no children are called leaves which are links in the dendrogram,
          // if the value of the links is zero we are setting it to 1 such that
          // zero data links also plotted
          if (d.data && d.children == null && d.data.value == 0) {
              d.data.value = 1;
              zeroDataLinks += 1;
          }
    });
    this.valueSum += zeroDataLinks;
    const valueScale = this.config.get('valueScale').domain([0.01, this.valueSum]).range([0, 360])
    this.hierarchyRootNode = this.hierarchyRootNode.sum((d) => valueScale(d.value)).sort((a, b) => b.value - a.value)
    // console.log('hierarchyRootNode: ', this.hierarchyRootNode)
  }

  _prepareLinks () {
    this.links = []
    let i = 0
    const leaves = this.hierarchyRootNode.leaves()
    _.each(leaves, (leaf, leafIndex) => {
      for (i = leafIndex + 1; i < leaves.length; i++) {
        if (leaf.data.linkId === leaves[i].data.linkId) {
          this.links.push(leaf.path(leaves[i]))

        }
      }
      //Loop through links array and mark them as bi-directional/uni-directional
    })
    // console.log('Links: ', this.links)
  }

  _prepareCluster () {
    const extraPaddingPerDepth = _.fill(_.range(this.params.drillDownLevel + 1), 0)
    // Create the cluster layout.
    const cluster = d3Hierarchy.cluster().size([360, this.params.innerRadius])
    // const cluster = d3Hierarchy.tree().size([360, this.params.innerRadius])
    .separation((a, b) => {
      let distance = (a.value + b.value) / 2
      if (a.parent !== b.parent) {
        // Count how many ancestors differ the two nodes.
        const aAncestors = a.ancestors()
        const bAncestors = b.ancestors()
        const differences = Math.max(0, _.difference(aAncestors, bAncestors).length - this.params.parentSeparationDepthThreshold)
        const extraPadding = this.params.parentSeparation * differences * this.hierarchyRootNode.value / 360
        distance += extraPadding
        extraPaddingPerDepth[a.depth] += extraPadding
      }
      return distance
    })
    cluster(this.hierarchyRootNode)
  }

  _prepareCircles () {
    this.circles = []
    const radiusScale = d3Scale.scaleLinear().domain([0, this.params.drillDownLevel]).range([0, this.params.innerRadius]).clamp(true)
    this.hierarchyRootNode.each((n) => {
      if (!n.parent || !n.children) {
        return
      }
      n.y = radiusScale(n.depth)
      if (this.circles.length === n.depth) {
        this.circles[n.depth] = { r: n.y }
      }
    })
    // console.log('circles: ', this.circles)
  }

  /**
  * Positions the arcs.
  */
  _prepareAngleRanges () {
    const depthValueOffset = [0]
    this.hierarchyRootNode.angleRange = [0, 360]
    this.hierarchyRootNode.valueRange = [0, this.hierarchyRootNode.value]
    this.hierarchyRootNode.angleScale = d3Scale.scaleLinear().domain(this.hierarchyRootNode.valueRange).range(this.hierarchyRootNode.angleRange)
    this.hierarchyRootNode.each((n) => {
      if (!n.parent) {
        return
      }
      if (depthValueOffset.length <= n.depth) {
        depthValueOffset.push(0)
      }
      const minValue = depthValueOffset[n.depth]
      const maxValue = minValue + n.value
      depthValueOffset[n.depth] = maxValue
      n.valueRange = [minValue, maxValue]
      let minAngle = n.parent.angleScale(minValue)
      let maxAngle = n.parent.angleScale(maxValue)
      // Shrink the angle range in order to create padding between nodes.
      n.separationValue = 0
      if (n.depth < this.params.parentSeparationDepthThreshold) {
          // To keep consistent gap between the arcs.
          n.separationValue = this.params.parentSeparationShrinkFactor * 20
      }
      minAngle += n.separationValue
      maxAngle -= n.separationValue
      n.angleRange = [minAngle, maxAngle]
      n.angleScale = d3Scale.scaleLinear().domain(n.valueRange).range(n.angleRange)
    })
    // Now shrink the parent nodes by the amount of sepration added to children.

    // Commented the parent shrink code because when there are more children
    // the start and end arcs of children are going beyond the parent arc angle range.
    /*this.hierarchyRootNode.each((n) => {
      if (!n.parent) {
        return
      }
      let separationValueOfChildren = 0
      _.each(n.descendants(), (child) => {
        separationValueOfChildren += child.separationValue
      })
      n.angleRange[0] += separationValueOfChildren
      n.angleRange[1] -= separationValueOfChildren
      n.angleScale = d3Scale.scaleLinear().domain(n.valueRange).range(n.angleRange)
    })*/
  }

  /**
  * Prepares the connections. A connection consists of a path:
  * - starting from the leaf of the outer edge of the ribbon
  * - moving to just before the root
  * - leaf of the outer edge of the target arc
  * - inner edge to just before the root
  * - inner edge of the source leaf arc.
  */
  _prepareRibbons () {
    let ribbons =  this.ribbons
    this.ribbons = []
    _.each(this.links, (link) => {
      const src = link[0]
      const dst = link[link.length - 1]
      const srcAncestors = src.ancestors()
      const dstAncestors = dst.ancestors()
      const outerPoints = []
      // Outer edge from source leaf to root.
      _.each(srcAncestors, (n, i) => {
        if (n.parent && n.children) {
          let valueStart = n.valueRange[0]
          if (n.children) {
            let found = false
            const leaves = n.leaves()
            _.each(leaves, (child) => {
              if (child === src) {
                found = true
              }
              if (!found) {
                valueStart += child.valueRange[1] - child.valueRange[0]
              }
            })
            if (!found) {
              // console.log('Never found')
            }
          }
          outerPoints.push([n.angleScale(valueStart), n.y])
        }
      })
      // Outer edge from root to target leaf.
      let i = 0
      for (i = dstAncestors.length - 1; i >= 0; i--) {
        let n = dstAncestors[i]
        if (n.parent && n.children) {
          let valueStart = n.valueRange[1]
          if (n.children) {
            let found = false
            let ci = 0
            const leaves = n.leaves()
            for (ci = leaves.length - 1; ci >= 0; ci--) {
              let child = leaves[ci]
              if (child === dst) {
                found = true
              }
              if (!found) {
                valueStart -= child.valueRange[1] - child.valueRange[0]
              }
            }
            if (!found) {
              // console.log('Never found')
            }
          }
          outerPoints.push([n.angleScale(valueStart), n.y])
        }
      }
      // Inner edge from target leaf to root.
      const innerPoints = []
      _.each(dstAncestors, (n, i) => {
        if (n.parent && n.children) {
          let valueStart = n.valueRange[0]
          if (n.children) {
            let found = false
            const leaves = n.leaves()
            _.each(leaves, (child) => {
              if (child === dst) {
                found = true
              }
              if (!found) {
                valueStart += child.valueRange[1] - child.valueRange[0]
              }
            })
            if (!found) {
              // console.log('Never found')
            }
          }
          innerPoints.push([n.angleScale(valueStart), n.y])
        }
      })
      // Inner edge from root to source leaf.
      for (i = srcAncestors.length - 1; i >= 0; i--) {
        let n = srcAncestors[i]
        if (n.parent && n.children) {
          let valueStart = n.valueRange[1]
          if (n.children) {
            let found = false
            let ci = 0
            const leaves = n.leaves()
            for (ci = leaves.length - 1; ci >= 0; ci--) {
              let child = leaves[ci]
              if (child === src) {
                found = true
              }
              if (!found) {
                valueStart -= child.valueRange[1] - child.valueRange[0]
              }
            }
          }
          innerPoints.push([n.angleScale(valueStart), n.y])
        }
      }
      let linkCssClass = ''
      _.each(this.params.linkCssClasses, function(cssClass) {
       let linkCssNode = src && src.data && _.find(src.data.dataChildren, function(child) {
          return child.linkCssClass === cssClass
        })
        if(linkCssNode) {
          linkCssClass = cssClass
          return false
        }
      })
      this.ribbons.push({
        outerPoints: outerPoints,
        innerPoints: innerPoints,
        id: src.data.linkId,
        link: [src,dst],
        linkCssClass: linkCssClass
      })
    })
    if(ribbons) {
      let selectedRibbon = _.filter(ribbons, function(ribbon) {
        return ribbon.selected;
      });
      if(selectedRibbon && selectedRibbon.length > 0) {
        _.filter(this.ribbons, function(ribbon) {
          if(ribbon.id == selectedRibbon[0].id) {
            ribbon.selected = true;
            ribbon.active = true;
          }
        });
      }
    }
  }

  _prepareArcs () {
    this.arcs = []
    this.hierarchyRootNode.each((n) => {
      if (!n.parent || !n.children) {
        return
      }
      // Estimate arc length and wheather the label will fit (default letter width is assumed to be 5px).
      n.arcLength = 6 * (n.y - this._checkValueIsArray(this.params.arcLabelYOffset, n.height)) * (n.angleRange[1] - n.angleRange[0]) / 360
      let namePath = (n.data.displayLabels && n.data.displayLabels.length > 0) ? n.data.displayLabels : n.data.namePath
      n.label = '' + namePath[namePath.length - 1]
      if(n.depth == 1 && n.data.labelAppend) {
        n.label += '-'+n.data.labelAppend;
      }
      let labelArcLengthDiff
      n.labelFits = (labelArcLengthDiff = (this.config.get('arcLabelLetterWidth') * n.label.length - n.arcLength)) < 0
      if(!n.labelFits){
        n.labelLengthToTrim = (labelArcLengthDiff + 4 * this.config.get('arcLabelLetterWidth')) / (this.config.get('arcLabelLetterWidth'))
      }
      if (this.config.get('labelFlow') === 'perpendicular') {
        n.labelFits = (n.arcLength > 9) && ((this.config.get('innerRadius') / this.config.get('drillDownLevel')) - this._checkValueIsArray(this.params.arcLabelYOffset, n.height) > this.config.get('arcLabelLetterWidth') * n.label.length)
      }
      this.arcs.push(n)
    })
  }

  _prepareHierarchy () {
    this._prepareRootNode()
    this._prepareHierarchyRootNode()
    this._prepareLinks()
    this._prepareCluster()
    this._prepareCircles()
    this._prepareAngleRanges()
    this._prepareRibbons()
    this._prepareArcs()
  }

  _render () {
    this.d3.attr('transform', `translate(${this.params.width / 2}, ${this.params.height / 2})`)
    // Circles
    const svgCircles = this.d3.selectAll('.circle').data(this.circles)
    svgCircles.enter().append('circle')
      .attr('class', 'circle')
      .attr('r', 0)
      .merge(svgCircles)
      .attr('r', (d) => d.r + 1)
    svgCircles.exit().remove()

    if (this.params.drawLinks) {
      // Links
      const radialLine = d3Shape.radialLine().angle((d) => d.x / 180 * Math.PI).radius((d) => d.y).curve(this.config.get('curve'))
      const svgLinks = this.d3.selectAll('.link').data(this.links)
      svgLinks.enter().append('path')
        .attr('class', (d) => 'link ' + d[0].data.id)
        .classed(this.selectorClass('interactive'), this.config.hasAction('node'))
        .style('stroke-width', 0)
        .attr('d', (d) => radialLine(d[0]))
      .merge(svgLinks)
        .style('stroke-width', (d) => (d[0].y * Math.sin((d[0].angleRange[1] - d[0].angleRange[0]) * Math.PI / 180)) + 'px')
        .attr('d', radialLine)
    }
    if (this.params.drawRibbons) {
      // Ribbons
      const radialLine = d3Shape.radialLine().angle((d) => d[0] / 180 * Math.PI).radius((d) => d[1]).curve(this.config.get('curve'))
      const svgLinks = this.d3.selectAll('.ribbon').data(this.ribbons, (d) => d.id)
      svgLinks.enter().append('path')
        .attr('class', (d) => 'ribbon' + ((d.active) ? ' active' : ''))
        .merge(svgLinks)// .transition().ease(this.config.get('ease')).duration(this.params.duration)
        .attr('class', (d) => 'ribbon' + ((d.active) ? ' active' : '') + (d.linkCssClass ? ' '+d.linkCssClass : ''))
        .classed(this.selectorClass('interactive'), this.config.hasAction('link'))
        .attr('d', (d) => {
          // var lastPoint = d.outerPoints[1];
          // var controlPoint = d.outerPoints[1] = [0,0];

          /*var startPoint = [d.outerPoints[0][1] * Math.cos(d.outerPoints[0][0]),d.outerPoints[0][1] * Math.sin(d.outerPoints[0][0])];
          var endPoint = [d.outerPoints[1][1] * Math.cos(d.outerPoints[1][0]),d.outerPoints[1][1] * Math.sin(d.outerPoints[1][0])];
          var midPoint = [(startPoint[0] + endPoint[0])/2, (startPoint[1] + endPoint[1])/2];
          //Convert midPoint form cartesian to Polar
          var midPointInPolar = [Math.atan2(midPoint[1],midPoint[0]),Math.sqrt(Math.pow(midPoint[0],2) + Math.pow(midPoint[1],2)*.9)];*/
          /*function getMidPoint(points) {
            //Converting to cartesian
            var out1 = { radians: points[0][0]/180 * Math.PI, radius: points[0][1]},
                out2 = { radians: points[1][0]/180 * Math.PI, radius: points[1][1]};

            var [x1,y1] = [out1.radius * Math.cos(out1.radians),out1.radius * Math.sin(out1.radians)];
            var [x2,y2] = [out1.radius * Math.cos(out2.radians),out1.radius * Math.sin(out2.radians)];
            var midPoint = [(x1 + x2)/2, (y1 + y2)/2];
            //Convert midPoint form cartesian to Polar
            var midPointInPolar = [Math.atan2(midPoint[1],midPoint[0])*57.29,Math.sqrt(Math.pow(midPoint[0],2) + Math.pow(midPoint[1],2)*.8)];
            return midPointInPolar;
          }*/
          // d.outerPoints.splice(1,0,getMidPoint(d.outerPoints));
          // d.innerPoints.splice(1,0,getMidPoint(d.innerPoints));

          var outerPoints = d.outerPoints
          var innerPoints = d.innerPoints

          if(outerPoints.length == 2 && innerPoints.length == 2) {
            var out1 = { radians: outerPoints[0][0]/180 * Math.PI, radius: outerPoints[0][1]},
                    out2 = { radians: outerPoints[1][0]/180 * Math.PI, radius: outerPoints[1][1]};
            var in1 = { radians: innerPoints[0][0]/180 * Math.PI, radius: innerPoints[0][1]},
                    in2 = { radians: innerPoints[1][0]/180 * Math.PI, radius: innerPoints[1][1]};

            var ribbon = (typeof d3v4 != 'undefined' ? d3v4 : d3Chord).ribbon().radius(out1.radius);
            var radians = [out1.radians,in1.radians,out2.radians,in2.radians];
            radians.sort();
            //Adding 10% buffer
            var startWidth = Math.abs(radians[0]-radians[1])*.35,
              endWidth = Math.abs(radians[2]-radians[3])*.35;
            return ribbon({
                source: {startAngle: radians[0]+startWidth,endAngle:radians[1]-startWidth},
                target: {startAngle: radians[2]+endWidth,endAngle:radians[3]-endWidth}
            });
            return ribbon({
                source: {startAngle: out1.radians,endAngle:in1.radians},
                target: {startAngle: Math.min(out2.radians,in2.radians),endAngle:Math.max(out2.radians,in2.radians)}
            });
          }

          if (outerPoints.length == 4 && innerPoints.length == 4) {
            outerPoints = _.map(outerPoints, _.clone)
            innerPoints = _.map(innerPoints, _.clone)
            var percentage = .25;
            outerPoints[0][0] = outerPoints[0][0] + (Math.abs(outerPoints[0][0] - innerPoints[3][0]) * percentage);
            outerPoints[1][0] = outerPoints[1][0] + (Math.abs(outerPoints[1][0] - innerPoints[2][0]) * percentage);
            outerPoints[2][0] = outerPoints[2][0] - (Math.abs(outerPoints[2][0] - innerPoints[1][0]) * percentage);
            outerPoints[3][0] = outerPoints[3][0] - (Math.abs(outerPoints[3][0] - innerPoints[0][0]) * percentage);


            innerPoints[0][0] = innerPoints[0][0] + (Math.abs(outerPoints[0][0] - innerPoints[3][0]) * percentage);
            innerPoints[1][0] = innerPoints[1][0] + (Math.abs(outerPoints[1][0] - innerPoints[2][0]) * percentage);
            innerPoints[2][0] = innerPoints[2][0] - (Math.abs(outerPoints[2][0] - innerPoints[1][0]) * percentage);
            innerPoints[3][0] = innerPoints[3][0] - (Math.abs(outerPoints[3][0] - innerPoints[0][0]) * percentage);
          }
          //Need to try with simple sample for debugging 
          //Looks causing issues as it's using elliptical arc
          /*
          d.outerPoints = _.map(d.outerPoints,function(val,idx) {
            var diff = Math.abs(val[0],val[1])*.1;
            return [val[0]+diff,val[1]-diff];
          });
          d.innerPoints = _.map(d.innerPoints,function(val,idx) {
            var diff = Math.abs(val[0],val[1])*.1;
            return [val[0]+diff,val[1]-diff];
          });
          */

          const outerPath = radialLine(outerPoints)
          const innerPath = radialLine(innerPoints)
          var endingStitchLargeArc = 0;
          if(Math.abs(innerPoints.slice(-1)[0][0] - outerPoints.slice(0,1)[0][0]) > 180) {
            endingStitchLargeArc = 1;
          }
          const innerStitch = 'A' + outerPoints[0][1] + ' ' + outerPoints[0][1] + ' 0 0 0 '
          const endingStitch = 'A' + outerPoints[0][1] + ' ' + outerPoints[0][1] + ' 0 ' + endingStitchLargeArc + ' 0 ' +  radialLine([outerPoints[0]]).substr(1)

          return outerPath + innerStitch + innerPath.substr(1) + endingStitch
        })
      svgLinks.exit().remove()

      // Arc labels
      const arcLabelsAlongArcData = (this.params.labelFlow === 'along-arc') ? this.arcs : []
      const arcLabelsPerpendicularData = (this.params.labelFlow === 'perpendicular') ? this.arcs : []
      // Along Arc
      let svgArcLabels = this.d3.selectAll('.arc-label.along-arc').data(arcLabelsAlongArcData)
      let svgArcLabelsEnter = svgArcLabels.enter().append('text')
        .attr('class', (d) => { return 'arc-label along-arc arc-label-'+d.height })
        .attr('x', this.params.arcLabelXOffset)
        .attr("dy", function(d,i) { return ((d.angleRange[0] + d.angleRange[1])/2 > 90 && (d.angleRange[0] + d.angleRange[1])/2 < 270 ? 18 : -11); })
      svgArcLabelsEnter
        .append('textPath')
        .attr('xlink:href', (d) => '#' + d.data.namePath.join('-') + '-text')
        .attr('class', function (d) { return d.data.arcType ? d.data.arcType : '' })
      let svgArcLabelsEdit = svgArcLabelsEnter.merge(svgArcLabels).transition().ease(this.config.get('ease')).duration(this.params.labelDuration != null ? this.params.labelDuration : this.params.duration)
      svgArcLabelsEdit.select('textPath')
        .attr('startOffset',function(d) {
          return d.arcLength / 2
        })
        .text((d) => (this.config.get('showArcLabels') && d.labelFits) ? d.label : (d.label.slice(0,-(d.labelLengthToTrim)) + '...'))
      svgArcLabels.exit().remove()
      // Perpendicular
      svgArcLabels = this.d3.selectAll('.arc-label.perpendicular').data(arcLabelsPerpendicularData)
      svgArcLabelsEnter = svgArcLabels.enter().append('text')
        .attr('class', (d) => { return 'arc-label perpendicular arc-label-'+d.height })
        .merge(svgArcLabels)
        .attr('transform', (d) => {
          let alpha = ((d.angleRange[1] + d.angleRange[0]) / 2) + 90
          if ((d.angleRange[1] + d.angleRange[0]) / 2 < 180) {
            alpha -= 180
          }
          const x = (d.y + this._checkValueIsArray(this.params.arcLabelYOffset, d.height)) * Math.cos((d.angleRange[1] + d.angleRange[0] - 180) * Math.PI / 360) + this.params.arcLabelXOffset
          const y = (d.y + this._checkValueIsArray(this.params.arcLabelYOffset, d.height)) * Math.sin((d.angleRange[1] + d.angleRange[0] - 180) * Math.PI / 360)
          return `translate(${x}, ${y}) rotate(${alpha})`
        })
        .style('text-anchor', (d) => ((d.angleRange[1] + d.angleRange[0]) / 2 < 180) ? 'start' : 'end')
        .text((d) => (this.params.showArcLabels && d.labelFits) ? d.label : '')
      svgArcLabels.exit().remove()

      // Arcs for parent nodes.
      const arcEnter = d3Shape.arc()
        .innerRadius((n) => n.y)
        .outerRadius((n) => n.y + 1)
        .startAngle((n) => Math.PI * n.angleRange[0] / 180)
        .endAngle((n) => Math.PI * n.angleRange[1] / 180)
      const arc = d3Shape.arc()
        .innerRadius((n) => n.y)
        .outerRadius((n) => n.y + this._checkValueIsArray(this.params.arcWidth, n.height))
        .startAngle((n) => Math.PI * n.angleRange[0] / 180)
        .endAngle((n) => Math.PI * n.angleRange[1] / 180)
      const svgArcs = this.d3.selectAll('.arc').data(this.arcs, (d) => d.data.namePath.join('-'))
      d3.selectAll('.hiddenDonutArcs').remove();
      svgArcs.enter().append('path')
        .attr('id', (d) => d.data.namePath.join('-'))
        // .attr('d', arcEnter)
        .merge(svgArcs)
        .attr('d', arc)
        .attr('class', (d) => 'arc arc-' + d.depth + (d.data.arcType ? (' '+ d.data.arcType) : '') + (d.active ? ' active' : ''))
        .transition().ease(this.config.get('ease')).duration(this.params.duration)
        .style('fill', d => this.config.getColor([], this.config.get('levels')[d.depth - 1],d.data))
        .each(function(d,i) {
            //Search pattern for everything between the start and the first capital L
            var firstArcSection = /(^.+?)L/;    

            if(d3.select(this).attr("d") == null) {
                console.info("path is null");
                return;
            }
            //Grab everything up to the first Line statement
            var newArc = firstArcSection.exec( d3.select(this).attr("d") )[1];
            //Replace all the comma's so that IE can handle it
            newArc = newArc.replace(/,/g , " ");
            
            //If the end angle lies beyond a quarter of a circle (90 degrees or pi/2) 
            //flip the end and start position
            if ((d.angleRange[0] + d.angleRange[1])/2 > 90 && (d.angleRange[0] + d.angleRange[1])/2 < 270) {
                var startLoc    = /M(.*?)A/,        //Everything between the first capital M and first capital A
                    middleLoc   = /A(.*?)0 ([01]) 1/,   //Everything between the first capital A and 0 0 1
                    endLoc      = /0 [01] 1 (.*?)$/;    //Everything between the first 0 0 1 and the end of the string (denoted by $)
                //Flip the direction of the arc by switching the start en end point (and sweep flag)
                //of those elements that are below the horizontal line
                var newStart = endLoc.exec( newArc )[1];
                var newEnd = startLoc.exec( newArc )[1];
                var largeArc = middleLoc.exec( newArc )[2];
                var middleSec = middleLoc.exec( newArc )[1];
                
                //Build up the new arc notation, set the sweep-flag to 0
                newArc = "M" + newStart + "A" + middleSec + "0 " + largeArc + " 0 " + newEnd;
            }
            d3.select('svg g').append("path")
                .attr("class", "hiddenDonutArcs")
                .attr("id", d.data.namePath.join('-') + '-text')
                .attr("d", newArc)
                .style("fill", "none");
        });
      svgArcs.exit().transition().ease(this.config.get('ease')).duration(this.params.duration)
        .attr('d', arcEnter)
        .remove()
    }
  }

  // Checke value is array and get value based on level height
  _checkValueIsArray (value, height) {
    if(_.isArray(value)) {
      return value[height - 1];
    }
    return value;
  }

  // Event handlers

  _onDataModelChange () {
    this.render()
  }

  _onConfigModelChange () {
    this.render()
  }

  _onMousemove (d, el, e) {
    if(this.config.attributes && this.config.attributes.showArcInfo == 'disable') {
      return
    }
    const leaves = d.leaves()
    _.each(this.ribbons, (ribbon) => {
      ribbon.active = (Boolean(_.find(leaves, (leaf) => leaf.data.linkId === ribbon.id))) ? true : ribbon.selected
    })
    _.each(this.arcs, (arc) => {
      arc.active = Boolean(arc.data.namePath && arc.data.namePath.join('-') == e.target.id)
    })
    this._render()
    const [left, top] = d3Selection.mouse(this._container)
    if(this.clearArcTootltip) {
      clearTimeout(this.clearArcTootltip)
    }
    this.clearArcTootltip = setTimeout(() => {
      actionman.fire('ShowComponent', this.config.get('tooltip'), {left, top}, d.data)
      document.getElementById(this.config.get('tooltip')).style.right = 'auto'
    }, 300)
  }

  _onMouseout (d, el) {
    _.each(this.ribbons, (ribbon) => {
      if(!ribbon.selected) {
        ribbon.active = false
      }
    })
    _.each(this.arcs, (arc) => {
      arc.active = false
    })
    this._render()
    if(this.clearArcTootltip) {
      clearTimeout(this.clearArcTootltip)
    }
    actionman.fire('HideComponent', this.config.get('tooltip'))
  }

  _onClickNode (d, el, e) {
    if (d.depth < this.maxDepth && d.depth === this.params.drillDownLevel) {
      // Expand
      this.config.set('drillDownLevel', this.params.drillDownLevel + 1)
    } else if (d.depth < this.params.drillDownLevel) {
      // Collapse
      this.config.set('drillDownLevel', this.params.drillDownLevel - 1)
    }
    el.classList.remove(this.selectorClass('active'))
    super._onEvent(d, el, e)
  }
}
