import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import format from '~/format'
import {msg} from '~/translate'
import {Graph, graphColor} from '~/widget/graph'
import {isMobile} from '~/widget/userAgent'
import {Widget} from '~/widget/widget'

import {SENSOR_LABELS, SENSOR_PALETTE} from '../../visualizations'
import styles from './diasGraph.module.css'
import {alertPeriod, diasGraphData, SENSORS} from './diasGraphData'

const THRESHOLD = 'threshold'

export class DiasGraph extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.highlightCallback = this.highlightCallback.bind(this)
    }

    render() {
        const {startDate, endDate} = this.props
        const {data} = this.state
        if (!data) {
            return null
        }
        const unhighlightCallback = () => this.setState({point: null})
        const sensorLabels = SENSORS.map(sensor => SENSOR_LABELS[sensor])
        return (
            <div className={styles.wrapper}>
                <div className={styles.graph}>
                    <Graph
                        data={data}
                        highlights={this.highlights()}
                        connectSeparatedPoints
                        showLabelsOnHighlight={false}
                        labels={['date', ...sensorLabels, THRESHOLD]}
                        drawPoints
                        pointSize={2}
                        strokeWidth={1}
                        // Per series: the Graph widget sets a global color, which dygraph prefers over `colors`.
                        series={{
                            ...Object.fromEntries(SENSORS.map(sensor => [
                                SENSOR_LABELS[sensor], {color: SENSOR_PALETTE[sensor]}
                            ])),
                            [THRESHOLD]: {
                                color: graphColor('foreground'),
                                drawPoints: false,
                                strokePattern: [4, 4],
                                highlightCircleSize: 0
                            }
                        }}
                        highlightSeriesOpts={{
                            highlightCircleSize: 4
                        }}
                        highlightSeriesBackgroundAlpha={1}
                        highlightSeriesBackgroundColor={graphColor('highlightBackground')}
                        dateWindow={[startDate, endDate]}
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
                {this.renderLegend()}
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
                <Widget label={msg('process.dias.chartPixel.date')}>
                    {moment(point.date).format('YYYY-MM-DD')}
                </Widget>
                <Widget label={msg('process.dias.chartPixel.sensor')}>
                    {point.sensor}
                </Widget>
                <Widget label={msg('process.dias.chartPixel.di')}>
                    {format.number({value: point.di, precisionDigits: 3})}
                </Widget>
            </div>
        )
    }

    renderLegend() {
        const {observations} = this.props
        const observed = SENSORS.filter(sensor => observations.some(({source}) => source === sensor))
        return (
            <div className={styles.legend}>
                {observed.map(sensor => (
                    <span key={sensor} className={styles.legendEntry}>
                        <span className={styles.swatch} style={{backgroundColor: SENSOR_PALETTE[sensor]}}/>
                        {SENSOR_LABELS[sensor]}
                    </span>
                ))}
                <span className={styles.legendEntry}>
                    <span className={styles.thresholdSwatch}/>
                    {msg('process.dias.chartPixel.threshold')}
                </span>
            </div>
        )
    }

    highlights() {
        const {alert} = this.props
        const period = alertPeriod(alert)
        return period
            ? [{
                startDate: moment(period.startDate).subtract(0.5, 'days').toDate(),
                endDate: moment(period.endDate).add(0.5, 'days').toDate(),
                backgroundColor: '#FF000020',
                color: '#FF0000'
            }]
            : []
    }

    highlightCallback(_event, x, points) {
        const point = points.find(({name, yval}) => name !== THRESHOLD && Number.isFinite(yval))
        this.setState({
            point: point
                ? {date: x, sensor: point.name, di: point.yval, left: point.x <= 0.5}
                : null
        })
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps) {
        this.update(prevProps)
    }

    // The Graph widget compares data by reference, so it is rebuilt only for a new pixel or threshold.
    update(prevProps = {}) {
        const {observations, threshold} = this.props
        if (observations !== prevProps.observations || threshold !== prevProps.threshold) {
            this.setState({data: diasGraphData({observations, threshold})})
        }
    }
}

DiasGraph.propTypes = {
    endDate: PropTypes.object.isRequired,
    observations: PropTypes.array.isRequired,
    startDate: PropTypes.object.isRequired,
    threshold: PropTypes.number.isRequired,
    alert: PropTypes.object
}
