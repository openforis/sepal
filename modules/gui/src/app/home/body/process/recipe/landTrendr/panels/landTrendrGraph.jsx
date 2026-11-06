import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import format from '~/format'
import {msg} from '~/translate'
import {Graph, graphColor} from '~/widget/graph'
import {isMobile} from '~/widget/userAgent'
import {Widget} from '~/widget/widget'

import {landTrendrChartRows} from './landTrendrChart'
import styles from './landTrendrGraph.module.css'

// Draws a chart prepared for one pixel (landTrendrChart.js), as it is exported.
export class LandTrendrGraph extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.highlightCallback = this.highlightCallback.bind(this)
    }

    render() {
        const {data} = this.state
        if (!data) {
            return null
        }
        const unhighlightCallback = () => this.setState({point: null})
        return (
            <div className={styles.wrapper}>
                <Graph
                    data={data}
                    connectSeparatedPoints
                    showLabelsOnHighlight={false}
                    labels={['dates', 'observations', 'segments']}
                    series={{
                        segments: {
                            strokeWidth: 2
                        },
                        observations: {
                            drawPoints: true,
                            strokeWidth: 0,
                            color: graphColor('foreground'),
                            highlightCircleSize: 1
                        }
                    }}
                    highlightSeriesOpts={{
                        highlightCircleSize: 3
                    }}
                    highlightSeriesBackgroundAlpha={1}
                    highlightSeriesBackgroundColor={graphColor('highlightBackground')}
                    errorBars
                    sigma={1}
                    axes={{
                        x: {
                            ticker: yearlyTicker
                        }
                    }}
                    showRangeSelector={!isMobile()}
                    rangeSelectorPlotFillColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorPlotFillGradientColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorPlotStrokeColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorAlpha={0.2}
                    rangeSelectorBackgroundStrokeColor={graphColor('rangeSelectorStroke')}
                    rangeSelectorForegroundStrokeColor={graphColor('rangeSelectorStroke')}
                    highlightCallback={isMobile() ? undefined : this.highlightCallback}
                    unhighlightCallback={isMobile() ? undefined : unhighlightCallback}
                />
                {this.renderPoint()}
            </div>
        )
    }

    renderPoint() {
        const {point} = this.state
        if (!point) {
            return null
        }
        return (
            <div
                className={styles.point}
                style={point.left ? {right: 0} : null}>
                <Widget
                    className={styles.year}
                    label={msg('process.landTrendr.mapToolbar.graph.year.label')}>
                    {point.year}
                </Widget>
                <Widget
                    className={styles.observation}
                    label={msg('process.landTrendr.mapToolbar.graph.observation.label')}>
                    {format.number({value: point.raw, precisionDigits: 3})}
                </Widget>
                {_.isFinite(point.fitted)
                    ? (
                        <Widget
                            className={styles.fitted}
                            label={msg('process.landTrendr.mapToolbar.graph.fitted.label')}>
                            {format.number({value: point.fitted, precisionDigits: 3})}
                        </Widget>
                    )
                    : null}
            </div>
        )
    }

    highlightCallback(event, x, points, row) {
        const {chart: {years, raw, fitted}} = this.props
        const point = points[0]
        this.setState({
            point: {
                year: years[row],
                raw: raw[row],
                fitted: fitted[row],
                left: point.x <= 0.5
            }
        })
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps) {
        this.update(prevProps)
    }

    // The Graph widget compares data by reference, so rebuilding it on every render would make dygraph redraw the
    // whole chart on each mouse move: rows are built again only for another chart.
    update(prevProps = {}) {
        const {chart} = this.props
        if (chart !== prevProps.chart) {
            this.setState({data: landTrendrChartRows(chart)})
        }
    }
}

// Dygraph's default date ticker picks a granularity (yearly, quarterly, ...)
// based on pixel width, which can place more than one tick per year - a
// custom ticker sidesteps that entirely by placing exactly one tick per
// calendar year, regardless of chart width.
const yearlyTicker = (a, b, _pixels, _opts, _dygraph) => {
    const startYear = new Date(a).getFullYear()
    const endYear = new Date(b).getFullYear()
    const ticks = []
    for (let year = startYear; year <= endYear; year++) {
        const v = new Date(year, 0, 1).getTime()
        if (v >= a && v <= b) {
            ticks.push({v, label: String(year)})
        }
    }
    return ticks
}

LandTrendrGraph.propTypes = {
    chart: PropTypes.shape({
        fitted: PropTypes.array,
        isVertex: PropTypes.array,
        raw: PropTypes.array,
        years: PropTypes.array
    }).isRequired
}
