import _ from 'lodash'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import format from '~/format'
import {msg} from '~/translate'
import {Graph, graphColor} from '~/widget/graph'
import {isMobile} from '~/widget/userAgent'
import {Widget} from '~/widget/widget'

import {ccdcChartRows, UNCERTAINTY_SIGMA} from './ccdcChart'
import styles from './ccdcGraph.module.css'
import {fromT} from './t'

// Draws a chart prepared for one band at one pixel (ccdcChart.js), as it is exported.
export class CCDCGraph extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.highlightCallback = this.highlightCallback.bind(this)
    }

    render() {
        const {chart: {startDate, endDate}, highlights = []} = this.props
        const {data, gaps} = this.state
        if (!data || !startDate || !endDate)
            return null

        const unhighlightCallback = () => this.setState({point: null})
        const hasTimeRange = data.length > 1 && data[0][0] < data.at(-1)[0]

        return (
            <div className={styles.wrapper}>
                <Graph
                    data={data}
                    highlights={[...gaps, ...highlights]}
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
                    axes={{
                        x: {
                            pixelsPerLabel: remToPx(6)
                        }
                    }}
                    highlightSeriesBackgroundAlpha={1}
                    highlightSeriesBackgroundColor={graphColor('highlightBackground')}
                    dateWindow={[startDate, endDate]}
                    showRangeSelector={!isMobile() && hasTimeRange}
                    rangeSelectorPlotFillColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorPlotFillGradientColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorPlotStrokeColor={graphColor('rangeSelectorPlot')}
                    rangeSelectorAlpha={0.2}
                    rangeSelectorBackgroundStrokeColor={graphColor('rangeSelectorStroke')}
                    rangeSelectorForegroundStrokeColor={graphColor('rangeSelectorStroke')}
                    errorBars
                    sigma={UNCERTAINTY_SIGMA}
                    highlightCallback={isMobile() ? undefined : this.highlightCallback}
                    unhighlightCallback={isMobile() ? undefined : unhighlightCallback}
                />
                {this.renderPoint()}
            </div>
        )
    }

    renderPoint() {
        const {chart: {segments}} = this.props
        const {point} = this.state
        if (!point)
            return null
        return segments
            ? this.renderPointWithModel()
            : this.renderObservation()
    }

    renderPointWithModel() {
        const {chart: {observations}} = this.props
        const {point} = this.state
        const hasModel = _.isFinite(point.model)
        const hasObservation = _.isFinite(point.observation)
        return (
            <div
                className={styles.point}
                style={point.left ? {right: 0} : null}>
                <Widget
                    className={styles.date}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.date.label')}>
                    {moment(point.date).format('YYYY-MM-DD')}
                </Widget>
                <Widget
                    className={styles.model}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.model.label')}>
                    {hasModel
                        ? format.number({value: point.model, precisionDigits: 3, minScale: 'p'})
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
                {observations
                    ? (
                        <Widget
                            className={styles.observation}
                            label={msg('process.ccdc.mapToolbar.ccdcGraph.observation.label')}>
                            {hasObservation
                                ? format.number({value: point.observation, precisionDigits: 3})
                                : <React.Fragment>&ndash;</React.Fragment>
                            }
                        </Widget>
                    ) : null
                }

                <Widget
                    className={styles.startDate}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.startDate.label')}>
                    {hasModel
                        ? moment(point.startDate).format('YYYY-MM-DD')
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
                <Widget
                    className={styles.endDate}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.endDate.label')}>
                    {hasModel
                        ? moment(point.endDate).format('YYYY-MM-DD')
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
                <Widget
                    className={styles.rmse}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.rmse.label')}>
                    {hasModel
                        ? format.number({value: point.rmse, precisionDigits: 3, minScale: 'p'})
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
                <Widget
                    className={styles.magnitude}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.magnitude.label')}>
                    {hasModel
                        ? format.number({value: point.magnitude, precisionDigits: 3, minScale: 'p'})
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
                <Widget
                    className={styles.observationCount}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.observationCount.label')}>
                    {hasModel
                        ? point.observationCount
                        : <React.Fragment>&ndash;</React.Fragment>
                    }
                </Widget>
            </div>
        )
    }

    renderObservation() {
        const {point} = this.state
        return (
            <div
                className={styles.point}
                style={point.left ? {right: 0} : null}>
                <Widget
                    className={styles.date}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.date.label')}>
                    {moment(point.date).format('YYYY-MM-DD')}
                </Widget>
                <Widget
                    className={styles.observation}
                    label={msg('process.ccdc.mapToolbar.ccdcGraph.observation.label')}>
                    {format.number({value: point.observation, precisionDigits: 3})}
                </Widget>
            </div>
        )
    }

    // A model day is described as it was prepared: its value, and the segment it was evaluated from.
    highlightCallback(event, x, points, row) {
        const {chart: {model, segments, band, dateFormat}} = this.props
        const {data} = this.state
        const point = points[0]
        const [date, observationArray] = data[row]
        const observation = observationArray ? observationArray[0] : null
        const observationInfo = points.find(point => point.name === 'observations')
            ? {observation}
            : {}
        const pointInfo = {date, left: point.x <= 0.5, ...observationInfo}
        if (model) {
            const {value, segmentIndex, method} = model[row]
            const segmentInfo = method !== 'masked'
                ? {
                    model: value,
                    startDate: fromT(segments.tStart[segmentIndex], dateFormat),
                    endDate: fromT(segments.tEnd[segmentIndex], dateFormat),
                    tBreak: segments.changeProb[segmentIndex]
                        ? fromT(segments.tBreak[segmentIndex], dateFormat)
                        : null,
                    magnitude: segments[`${band}_magnitude`][segmentIndex],
                    rmse: segments[`${band}_rmse`][segmentIndex],
                    observationCount: segments.numObs[segmentIndex]
                }
                : {}
            this.setState({point: {...pointInfo, ...segmentInfo}})
        } else {
            this.setState({point: pointInfo})
        }
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps) {
        this.update(prevProps)
    }

    // The Graph widget compares data by reference: rows are built again only for another chart.
    update(prevProps = {}) {
        const {chart} = this.props
        if (chart !== prevProps.chart) {
            this.setState({data: ccdcChartRows(chart), gaps: this.calculateGaps()})
        }
    }

    calculateGaps() {
        const {chart: {dateFormat, segments, startDate, endDate}, highlightGaps} = this.props
        if (!segments || !highlightGaps)
            return []
        const gapColor = '#1B1B1C'
        const startGap = {
            startDate: new Date(startDate),
            endDate: fromT(segments.tStart[0], dateFormat),
            backgroundColor: gapColor,
            color: gapColor
        }
        const inBetweenGaps = segments.tEnd
            .slice(0, segments.tEnd.length - 1)
            .map((tEnd, segmentIndex) => {
                return {
                    startDate: fromT(tEnd, dateFormat),
                    endDate: fromT(segments.tStart[segmentIndex + 1], dateFormat),
                    backgroundColor: gapColor,
                    color: gapColor
                }
            })
        const endGap = {
            startDate: fromT(segments.tEnd[segments.tEnd.length - 1], dateFormat),
            endDate: new Date(endDate),
            backgroundColor: gapColor,
            color: gapColor
        }
        return [startGap, ...inBetweenGaps, endGap]
    }
}

const remToPx = rem => rem * parseFloat(getComputedStyle(document.documentElement).fontSize)

CCDCGraph.propTypes = {
    chart: PropTypes.shape({
        band: PropTypes.string,
        dateFormat: PropTypes.number,
        endDate: PropTypes.any,
        model: PropTypes.array,
        observations: PropTypes.object,
        segments: PropTypes.object,
        startDate: PropTypes.any
    }).isRequired,
    highlightGaps: PropTypes.any,
    highlights: PropTypes.arrayOf(PropTypes.shape({
        backgroundColor: PropTypes.string.isRequired,
        color: PropTypes.string.isRequired,
        endDate: PropTypes.any.isRequired,
        startDate: PropTypes.any.isRequired,
    }))
}
