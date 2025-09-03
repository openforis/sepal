import Dygraph from 'dygraphs'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'

import styles from './graph.module.css'

class _Graph extends React.Component {
    state = {}
    graph = null
    options = null
    graphRef = React.createRef()

    shouldComponentUpdate(nextProps) {
        const {data, highlights, dimensions} = this.props
        const {data: nextData, highlights: nextHighlights} = nextProps
        const options = this.getOptions(this.props)
        const nextOptions = this.getOptions(nextProps)
        const nextDimensions = nextProps.dimensions
        return !_.isEqual(dimensions, nextDimensions)
            || data !== nextData
            || !_.isEqual(highlights, nextHighlights)
            || !_.isEqual(_.omit(options, CALLBACKS), _.omit(nextOptions, CALLBACKS))
    }

    render() {
        const {className} = this.props
        return (
            <div className={[styles.wrapper, className].join(' ')}>
                <div ref={this.graphRef} className={styles.graph}/>
            </div>
        )
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps) {
        this.update(prevProps)
    }

    update(prevProps = {}) {
        const {data, highlights, dimensions} = this.props
        const {dimensions: prevDimentions} = prevProps
        const options = this.getOptions(this.props)
        const updatedData = data
        const newState = {data: updatedData, options}
        this.setState(newState)
        const underlayCallback = createUnderlayCallback(highlights)
        if (!this.graph || !_.isEqual(dimensions, prevDimentions)) {
            this.graph = new Dygraph(this.graphRef.current, data, {...options, underlayCallback})
        } else {
            this.graph.updateOptions({file: [...updatedData], underlayCallback})
        }
    }

    getOptions(props) {
        return _.pick(props, [
            'animatedZooms',
            'annotationClickHandler',
            'annotationDblClickHandler',
            'annotationMouseOutHandler',
            'annotationMouseOverHandler',
            'axes',
            'axis',
            'axisLabelFontSize',
            'axisLabelFormatter',
            'axisLabelWidth',
            'axisLineColor',
            'axisLineWidth',
            'axisTickSize',
            'clickCallback',
            'color',
            'colors',
            'colorSaturation',
            'colorValue',
            'connectSeparatedPoints',
            'customBars',
            'dataHandler',
            'dateWindow',
            'delimiter',
            'digitsAfterDecimal',
            'displayAnnotations',
            'drawAxesAtZero',
            'drawAxis',
            'drawCallback',
            'drawGapEdgePoints',
            'drawGrid',
            'drawHighlightPointCallback',
            'drawPointCallback',
            'drawPoints',
            'errorBars',
            'file',
            'fillAlpha',
            'fillGraph',
            'fractions',
            'gridLineColor',
            'gridLinePattern',
            'gridLineWidth',
            'height',
            'hideOverlayOnMouseOut',
            'highlightCallback',
            'highlightCircleSize',
            'highlightSeriesBackgroundAlpha',
            'highlightSeriesBackgroundColor',
            'highlightSeriesOpts',
            'includeZero',
            'independentTicks',
            'interactionModel',
            'labels',
            'labelsDiv',
            'labelsKMB',
            'labelsKMG2',
            'labelsSeparateLines',
            'labelsShowZeroValues',
            'labelsUTC',
            'legend',
            'legendFormatter',
            'logscale',
            'maxNumberWidth',
            'panEdgeFraction',
            'pixelRatio',
            'pixelsPerLabel',
            'plotter',
            'plugins',
            'pointClickCallback',
            'pointSize',
            'rangeSelectorAlpha',
            'rangeSelectorBackgroundLineWidth',
            'rangeSelectorBackgroundStrokeColor',
            'rangeSelectorForegroundLineWidth',
            'rangeSelectorForegroundStrokeColor',
            'rangeSelectorHeight',
            'rangeSelectorPlotFillColor',
            'rangeSelectorPlotFillGradientColor',
            'rangeSelectorPlotLineWidth',
            'rangeSelectorPlotStrokeColor',
            'rightGap',
            'rollPeriod',
            'series',
            'showInRangeSelector',
            'showLabelsOnHighlight',
            'showRangeSelector',
            'showRoller',
            'sigFigs',
            'sigma',
            'stackedGraph',
            'stackedGraphNaNFill',
            'stepPlot',
            'strokeBorderColor',
            'strokeBorderWidth',
            'strokePattern',
            'strokeWidth',
            'ticker',
            'timingName',
            'title',
            'titleHeight',
            'underlayCallback',
            'unhighlightCallback',
            'valueFormatter',
            'valueRange',
            'visibility',
            'width',
            'wilsonInterval',
            'xAxisHeight',
            'xlabel',
            'xLabelHeight',
            'xRangePad',
            'xValueParser',
            'y2label',
            'ylabel',
            'yLabelWidth',
            'yRangePad',
            'zoomCallback',
        ])
    }
}

const createUnderlayCallback = highlights =>
    (canvas, area, g) => {
        (highlights || []).forEach(({startDate, endDate, backgroundColor, color}) => {
            const bottomLeft = g.toDomCoords(startDate, 0)
            const topRight = g.toDomCoords(endDate, 0)
            const left = bottomLeft[0]
            const right = topRight[0]
            canvas.fillStyle = backgroundColor
            canvas.strokeStyle = color
            canvas.fillRect(left, area.y, right - left, area.h)
            canvas.beginPath()
            canvas.moveTo(left, area.y)
            canvas.lineTo(left, area.h)
            canvas.moveTo(right, area.y)
            canvas.lineTo(right, area.h)
            canvas.stroke()
        })
    }

const CALLBACKS = ['clickCallback', 'drawCallback', 'drawHighlightPointCallback', 'drawPointCallback',
    'highlightCallback', 'pointClickCallback', 'underlayCallback', 'unhighlightCallback', 'zoomCallback']

export const Graph = compose(
    _Graph,
    asFunctionalComponent({
        color: '#FFB300'
    })
)

Graph.propTypes = {
    data: PropTypes.array.isRequired,
    animatedZooms: PropTypes.bool,
    annotationClickHandler: PropTypes.func,
    annotationDblClickHandler: PropTypes.func,
    annotationMouseOutHandler: PropTypes.func,
    annotationMouseOverHandler: PropTypes.func,
    axes: PropTypes.any,
    axis: PropTypes.string,
    axisLabelFontSize: PropTypes.number,
    axisLabelFormatter: PropTypes.any,
    axisLabelWidth: PropTypes.number,
    axisLineColor: PropTypes.string,
    axisLineWidth: PropTypes.number,
    axisTickSize: PropTypes.number,
    className: PropTypes.string,
    clickCallback: PropTypes.func,
    color: PropTypes.string,
    colors: PropTypes.any,
    colorSaturation: PropTypes.number,
    colorValue: PropTypes.number,
    connectSeparatedPoints: PropTypes.bool,
    customBars: PropTypes.bool,
    dataHandler: PropTypes.any,
    dateWindow: PropTypes.any,
    delimiter: PropTypes.string,
    digitsAfterDecimal: PropTypes.number,
    displayAnnotations: PropTypes.bool,
    drawAxesAtZero: PropTypes.bool,
    drawAxis: PropTypes.bool,
    drawCallback: PropTypes.func,
    drawGapEdgePoints: PropTypes.bool,
    drawGrid: PropTypes.bool,
    drawHighlightPointCallback: PropTypes.func,
    drawPointCallback: PropTypes.func,
    drawPoints: PropTypes.bool,
    errorBars: PropTypes.bool,
    file: PropTypes.oneOfType([PropTypes.string, PropTypes.array, PropTypes.func]),
    fillAlpha: PropTypes.number,
    fillGraph: PropTypes.bool,
    fractions: PropTypes.bool,
    gridLineColor: PropTypes.string,
    gridLinePattern: PropTypes.arrayOf(PropTypes.number),
    gridLineWidth: PropTypes.number,
    height: PropTypes.number,
    hideOverlayOnMouseOut: PropTypes.bool,
    highlightCallback: PropTypes.func,
    highlightCircleSize: PropTypes.any,
    highlights: PropTypes.arrayOf(PropTypes.shape({
        color: PropTypes.string.isRequired,
        endDate: PropTypes.any.isRequired,
        startDate: PropTypes.any.isRequired,
    })),
    highlightSeriesBackgroundAlpha: PropTypes.number,
    highlightSeriesBackgroundColor: PropTypes.string,
    highlightSeriesOpts: PropTypes.any,
    includeZero: PropTypes.bool,
    independentTicks: PropTypes.bool,
    interactionModel: PropTypes.any,
    labels: PropTypes.arrayOf(PropTypes.string),
    labelsDiv: PropTypes.any,
    labelsKMB: PropTypes.bool,
    labelsKMG2: PropTypes.bool,
    labelsSeparateLines: PropTypes.bool,
    labelsShowZeroValues: PropTypes.bool,
    labelsUTC: PropTypes.bool,
    legend: PropTypes.oneOf(['onmouseover', 'always', 'follow', 'never']),
    legendFormatter: PropTypes.func,
    logscale: PropTypes.bool,
    maxNumberWidth: PropTypes.number,
    panEdgeFraction: PropTypes.number,
    pixelRatio: PropTypes.number,
    pixelsPerLabel: PropTypes.number,
    plotter: PropTypes.oneOfType([PropTypes.func, PropTypes.arrayOf(PropTypes.func)]),
    plugins: PropTypes.any,
    pointClickCallback: PropTypes.func,
    pointSize: PropTypes.number,
    rangeSelectorAlpha: PropTypes.number,
    rangeSelectorBackgroundLineWidth: PropTypes.number,
    rangeSelectorBackgroundStrokeColor: PropTypes.string,
    rangeSelectorForegroundLineWidth: PropTypes.number,
    rangeSelectorForegroundStrokeColor: PropTypes.string,
    rangeSelectorHeight: PropTypes.number,
    rangeSelectorPlotFillColor: PropTypes.string,
    rangeSelectorPlotFillGradientColor: PropTypes.string,
    rangeSelectorPlotLineWidth: PropTypes.number,
    rangeSelectorPlotStrokeColor: PropTypes.string,
    rightGap: PropTypes.number,
    rollPeriod: PropTypes.number,
    series: PropTypes.any,
    showInRangeSelector: PropTypes.bool,
    showLabelsOnHighlight: PropTypes.bool,
    showRangeSelector: PropTypes.bool,
    showRoller: PropTypes.bool,
    sigFigs: PropTypes.number,
    sigma: PropTypes.number,
    stackedGraph: PropTypes.bool,
    stackedGraphNaNFill: PropTypes.any,
    stepPlot: PropTypes.bool,
    strokeBorderColor: PropTypes.string,
    strokeBorderWidth: PropTypes.number,
    strokePattern: PropTypes.any,
    strokeWidth: PropTypes.number,
    ticker: PropTypes.any,
    timingName: PropTypes.any,
    title: PropTypes.any,
    titleHeight: PropTypes.number,
    underlayCallback: PropTypes.func,
    unhighlightCallback: PropTypes.func,
    valueFormatter: PropTypes.any,
    valueRange: PropTypes.any,
    visibility: PropTypes.array,
    width: PropTypes.number,
    wilsonInterval: PropTypes.any,
    xAxisHeight: PropTypes.number,
    xlabel: PropTypes.any,
    xLabelHeight: PropTypes.number,
    xRangePad: PropTypes.number,
    xValueParser: PropTypes.any,
    y2label: PropTypes.any,
    ylabel: PropTypes.any,
    yLabelWidth: PropTypes.number,
    yRangePad: PropTypes.number,
    zoomCallback: PropTypes.func
}
