import React from 'react'
import PropTypes from 'prop-types'
import {Graph} from 'widget/graph'
import moment from 'moment'
import styles from './ccdcGraph.module.css'
import Label from 'widget/label'
import {msg} from 'translate'
import format from 'format'
import {isMobile} from 'widget/userAgent'
import _ from 'lodash'

export class CCDCGraph extends React.Component {
    state = {}


    render() {
        const {segments, band, dateFormat, highlights = []} = this.props
        const {data, gaps} = this.state
        const {startDate, endDate} = this.getDates()
        if (!data || !startDate || !endDate)
            return null

        const highlightCallback = (event, x, points, row) => {
            const point = points[0]
            const [date, observationArray, modelArray] = data[row]
            const observation = observationArray ? observationArray[0] : null
            const model = modelArray ? modelArray[0] : null
            const observationInfo = points.find(point => point.name === 'observations')
                ? {observation}
                : {}
            const segmentIndex = sequence(0, segments.tStart.length - 1)
                .findIndex(segmentIndex =>
                    moment(fromT(segments.tStart[segmentIndex], dateFormat)).startOf('date').toDate() <= date
                    && moment(fromT(segments.tEnd[segmentIndex], dateFormat)).startOf('date').toDate() > date
                )
            // TODO: Deal with extrapolation and interpolation - no segmentIndex found
            const segmentInfo = segmentIndex !== -1
                ? {
                    model,
                    startDate: fromT(segments.tStart[segmentIndex], dateFormat),
                    endDate: fromT(segments.tEnd[segmentIndex], dateFormat),
                    tBreak: segments.changeProb[segmentIndex]
                        ? fromT(segments.tBreak[segmentIndex], dateFormat)
                        : null,
                    magnitude: segments[`${band}_magnitude`][segmentIndex],
                    rmse: segments[`${band}_rmse`][segmentIndex],
                    observationCount: segments.numObs[segmentIndex],
                    left: point.x <= 0.5
                }
                : {}
            this.setState({point: {date, ...observationInfo, ...segmentInfo}})
        }

        const unhighlightCallback = () => this.setState({point: null})

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
                            color: '#FFFFFF',
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
                    highlightSeriesBackgroundColor={'hsla(0, 0%, 0%, 1)'}
                    dateWindow={[startDate, endDate]}
                    showRangeSelector={!isMobile()}
                    rangeSelectorPlotFillColor={'#1B1B1C'}
                    rangeSelectorPlotFillGradientColor={'#1B1B1C'}
                    rangeSelectorPlotStrokeColor={'#1B1B1C'}
                    rangeSelectorAlpha={0.2}
                    rangeSelectorBackgroundStrokeColor={'rgba(100%, 100%, 100%, .15)'}
                    rangeSelectorForegroundStrokeColor={'rgba(100%, 100%, 100%, .15)'}
                    errorBars
                    sigma={1}
                    highlightCallback={isMobile() ? undefined: highlightCallback}
                    unhighlightCallback={isMobile() ? undefined :unhighlightCallback}
                />
                {this.renderPoint()}
            </div>
        )
    }


    renderPoint() {
        const {observations} = this.props
        const {point} = this.state
        if (!point)
            return null
        const hasModel = _.isFinite(point.model)
        const hasObservation = _.isFinite(point.observation)
        return (
            <div
                className={styles.point}
                style={point.left ? {right: 0} : null}>
                <div className={styles.date}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.date.label')} className={styles.label}/>
                    <div>{moment(point.date).format('YYYY-MM-DD')}</div>
                </div>
                <div className={styles.model}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.model.label')} className={styles.label}/>
                    <div>{hasModel
                        ? format.number({value: point.model, precisionDigits: 3})
                        : 'N/A'
                    }</div>
                </div>
                {observations
                    ? <div className={styles.observation}>
                        <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.observation.label')}
                               className={styles.label}/>
                        <div>{hasObservation
                            ? format.number({value: point.observation, precisionDigits: 3})
                            : 'N/A'
                        }</div>
                    </div>
                    : null
                }

                <div className={styles.startDate}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.startDate.label')} className={styles.label}/>
                    <div>{hasModel
                        ? moment(point.startDate).format('YYYY-MM-DD')
                        : 'N/A'
                    }</div>
                </div>
                <div className={styles.endDate}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.endDate.label')} className={styles.label}/>
                    <div>{hasModel
                        ? moment(point.endDate).format('YYYY-MM-DD')
                        : 'N/A'
                    }</div>
                </div>
                <div className={styles.rmse}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.rmse.label')} className={styles.label}/>
                    <div>{hasModel
                        ? format.number({value: point.rmse, precisionDigits: 3})
                        : 'N/A'
                    }</div>
                </div>
                <div className={styles.magnitude}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.magnitude.label')} className={styles.label}/>
                    <div>{hasModel
                        ? format.number({value: point.magnitude, precisionDigits: 3})
                        : 'N/A'
                    }</div>
                </div>
                <div className={styles.observationCount}>
                    <Label msg={msg('process.ccdc.mapToolbar.ccdcGraph.observationCount.label')}
                           className={styles.label}/>
                    <div>{hasModel
                        ? point.observationCount
                        : 'N/A'
                    }</div>
                </div>
            </div>
        )
    }

    getDates() {
        const {startDate, endDate, dateFormat, segments} = this.props
        return {
            startDate: startDate || (segments ? fromT(segments.tStart[0], dateFormat) : null),
            endDate: endDate || (segments ? fromT(segments.tEnd[segments.tEnd.length - 1], dateFormat) : null)
        }
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        this.update(prevProps)
    }

    update(prevProps = {}) {
        const {segments, observations} = this.props
        if (segments !== prevProps.segments || observations !== prevProps.observations) {
            this.setState({data: this.calculateData(), gaps: this.calculateGaps()})
        }
    }

    calculateGaps() {
        const {dateFormat, segments, highlightGaps} = this.props
        const {startDate, endDate} = this.getDates()
        if (!segments || !highlightGaps)
            return []
        const gapColor = '#1B1B1C'
        const startGap = {
            startDate: new Date(startDate),
            endDate: fromT(segments.tStart[0], dateFormat),
            color: gapColor
        }
        const inBetweenGaps = segments.tEnd
            .slice(0, segments.tEnd.length - 1)
            .map((tEnd, segmentIndex) => {
                return {
                    startDate: fromT(tEnd, dateFormat),
                    endDate: fromT(segments.tStart[segmentIndex + 1], dateFormat),
                    color: gapColor
                }
            })
        const endGap = {
            startDate: fromT(segments.tEnd[segments.tEnd.length - 1], dateFormat),
            endDate: new Date(endDate),
            color: gapColor
        }
        return [startGap, ...inBetweenGaps, endGap]
    }

    calculateData() {
        const {band, dateFormat, harmonics, segments, observations} = this.props
        const {startDate, endDate} = this.getDates()
        if (segments) {
            return segmentsData({band, startDate, endDate, dateFormat, harmonics, segments, observations})
        } else {
            return observations.features.map(feature => [
                new Date(feature.properties.date.value),
                [feature.properties.value, 0],
                null
            ])
        }
    }
}

const remToPx = rem => rem * parseFloat(getComputedStyle(document.documentElement).fontSize)

CCDCGraph.propTypes = {
    band: PropTypes.string,
    dateFormat: PropTypes.number.isRequired,
    startDate: PropTypes.any,
    endDate: PropTypes.any,
    highlightGaps: PropTypes.any,
    harmonics: PropTypes.number,
    segments: PropTypes.object,
    observations: PropTypes.object,
    highlights: PropTypes.arrayOf(PropTypes.shape({
        startDate: PropTypes.any.isRequired,
        endDate: PropTypes.any.isRequired,
        color: PropTypes.string.isRequired,
    })),
}

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

const segmentsData = ({observations, startDate, endDate, segments, band, dateFormat, harmonics = 3}) => {
    const bandCoefs = segments[`${band}_coefs`]
    const bandRmse = segments[`${band}_rmse`]

    const model = ({date, segmentIndex}) => {
        const coefs = bandCoefs[segmentIndex]
        const value = slice({coefs, date, dateFormat, harmonics})
        const rmse = bandRmse[segmentIndex]
        return [date, observationByTimestamp[date.getTime()] || null, [value, rmse]]
    }

    const gap = ({date, prevSegmentIndex, nextSegmentIndex}) => {
        // TODO: Support interpolation and extrapolation. Extra props needed for extrapolation
        return [date, observationByTimestamp[date.getTime()] || null, NaN]
    }

    const observationByTimestamp = {}
    if (observations) {
        observations.features.forEach(feature =>
            observationByTimestamp[moment(feature.properties.date.value).startOf('day').valueOf()] = [feature.properties.value, 0]
        )
    }

    const segmentStart = moment(fromT(segments.tStart[0], dateFormat))
    const beforePoints = sequence(0, segmentStart.diff(moment(startDate), 'days') - 1)
        .map(dateOffset => {
            const date = moment(startDate).add(dateOffset, 'days').toDate()
            return gap({date, prevSegmentIndex: null, nextSegmentIndex: 0})
        })
    const numberOfSegments = segments.tStart.length
    const segmentsPoints = segments.tStart.map((tStart, segmentIndex) => {
        const segmentStart = moment(fromT(tStart, dateFormat)).startOf('day')
        const segmentEnd = moment(fromT(segments.tEnd[segmentIndex], dateFormat)).startOf('day')
        const modelPoints = sequence(0, segmentEnd.diff(segmentStart, 'days') - 1)
            .map(dateOffset => {
                const date = moment(segmentStart).add(dateOffset, 'days').toDate()
                return model({date, segmentIndex})
            })
        const gapEnd = moment(segmentIndex < numberOfSegments - 1
            ? fromT(segments.tStart[segmentIndex + 1], dateFormat)
            : endDate)
        const gapPoints = sequence(0, gapEnd.diff(segmentEnd, 'days') - 1)
            .map(dateOffset => {
                const date = moment(segmentEnd).add(dateOffset, 'days').toDate()
                return gap({date, prevSegmentIndex: null, nextSegmentIndex: 0})
            })
        return [...modelPoints, ...gapPoints]
    }).flat()
    return [...beforePoints, ...segmentsPoints]
}

const slice = ({coefs, date, dateFormat, harmonics}) => {
    const t = toT(date, dateFormat)
    const omega = getOmega(dateFormat)

    return [
        coefs[0] + (coefs[1] * t),
        coefs[2] * Math.cos(t * omega) + coefs[3] * Math.sin(t * omega),
        coefs[4] * Math.cos(t * omega * 2) + coefs[5] * Math.sin(t * omega * 2),
        coefs[6] * Math.cos(t * omega * 3) + coefs[7] * Math.sin(t * omega * 3)
    ].slice(0, harmonics + 1).reduce((acc, value) => acc + value, 0)
}

const getOmega = (dateFormat) => {
    switch (dateFormat) {
        case J_DAYS:
            return 2.0 * Math.PI / 365.25
        case FRACTIONAL_YEARS:
            return 2.0 * Math.PI
        case UNIX_TIME_MILLIS:
            return 2.0 * Math.PI * 60 * 60 * 24 * 365.25
        default:
            throw Error('Only dateFormat 0 (Julian days), 1 (Fractional years), and 2 (Unix time milliseconds) is supported')
    }
}

const fromT = (t, dateFormat) => {
    switch (dateFormat) {
        case J_DAYS:
            const epochDay = 719529
            return new Date((t - epochDay) * 1000 * 3600 * 24)
        case FRACTIONAL_YEARS:
            const firstOfYear = moment().year(Math.floor(t)).month(1).day(1)
            const firstOfNextYear = moment(firstOfYear).add(1, 'years')
            const daysInYear = firstOfNextYear.diff(firstOfYear, 'days')
            const dayOfYear = Math.floor(daysInYear * (t % 1))
            return moment(firstOfYear).add(dayOfYear, 'days').toDate()
        case UNIX_TIME_MILLIS:
            return new Date(t)
        default:
            throw Error('Only dateFormat 0 (Julian days), 1 (Fractional years), and 2 (Unix time milliseconds) is supported')
    }
}

const toT = (date, dateFormat) => {
    switch (dateFormat) {
        case J_DAYS:
            const epochDay = 719529
            return date.getTime() / 1000 / 3600 / 24 + epochDay
        case FRACTIONAL_YEARS:
            const firstOfYear = new Date(Date.UTC(date.getFullYear(), 0, 1, 0, 0, 0))
            const firstOfNextYear = new Date(Date.UTC(date.getFullYear() + 1, 0, 1, 0, 0, 0))
            const fraction = (date - firstOfYear) / (firstOfNextYear - firstOfYear)
            return date.getFullYear() + fraction
        case UNIX_TIME_MILLIS:
            return date.getTime()
        default:
            throw Error('Only dateFormat 0 (jdate), 1 (fractional years), and 2 (unix seconds) is supported')
    }
}

const sequence = (start, end, step = 1) =>
    end >= start
        ? Array.apply(null, {length: Math.floor((end - start) / step) + 1})
            .map((_, i) => i * step + start)
        : []
