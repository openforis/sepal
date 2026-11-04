import PropTypes from 'prop-types'
import React from 'react'
import {catchError, EMPTY, exhaustMap, interval, startWith} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Graph} from '~/widget/graph'

import styles from './sessionUsageChart.module.css'

// The worker samples every minute, so refreshing faster would only fetch the same points again.
const REFRESH_INTERVAL_MS = 60000

// Percentages only: they share the chart's 0-100 scale. Network is in bytes/s and stays in the strip.
const SERIES = [
    {key: 'cpu', value: 'cpuPct', color: '#FFB300'},
    {key: 'ram', value: 'ramPct', color: '#4FC3F7'},
    {key: 'gpu', value: 'gpuPct', color: '#81C784', gpuOnly: true}
]

// Neutral grey at low alpha reads on either theme's background.
const GRID_LINE_COLOR = 'hsla(0, 0%, 50%, .25)'

// A session's CPU, RAM and GPU usage since it started, drawn like the histogram in the
// visualization parameters.
class _SessionUsageChart extends React.Component {
    state = {
        samples: null,
        width: null,
        hidden: []
    }

    ref = React.createRef()

    constructor(props) {
        super(props)
        this.onResize = this.onResize.bind(this)
    }

    render() {
        const {samples} = this.state
        return samples?.length > 1
            ? (
                <div className={styles.chart}>
                    {this.renderChart(samples)}
                </div>
            )
            : null
    }

    componentDidMount() {
        const {session, addSubscription} = this.props
        addSubscription(
            interval(REFRESH_INTERVAL_MS).pipe(
                startWith(0),
                exhaustMap(() => api.sessions.sessionUsage$(session).pipe(
                    // A failed refresh keeps the chart it has.
                    catchError(() => EMPTY)
                ))
            ).subscribe(({samples}) => this.setState({samples}))
        )
    }

    onResize({width}) {
        this.setState({width})
    }

    toggle(key) {
        this.setState(({hidden}) => ({
            hidden: hidden.includes(key)
                ? hidden.filter(hiddenKey => hiddenKey !== key)
                : [...hidden, key]
        }))
    }

    renderChart(samples) {
        const series = this.series()
        return (
            <React.Fragment>
                {this.renderGraph(samples, series)}
                {this.renderKey(series)}
            </React.Fragment>
        )
    }

    renderGraph(samples, series) {
        const {width, hidden} = this.state
        return (
            <ElementResizeDetector targetRef={this.ref} onResize={this.onResize}>
                <div ref={this.ref} className={styles.graph}>
                    {width
                        ? (
                            <Graph
                                data={samples.map(sample => [new Date(sample.time), ...series.map(({value}) => sample[value])])}
                                dimensions={width}
                                // Time along the bottom, with a faint line up from each tick.
                                axes={{
                                    x: {drawAxis: true, drawGrid: true},
                                    y: {drawAxis: false, drawGrid: false}
                                }}
                                axisLabelFontSize={10}
                                axisLineColor='transparent'
                                gridLineColor={GRID_LINE_COLOR}
                                labels={['time', ...series.map(({key}) => key)]}
                                // Per series: Graph's default `color` would otherwise paint every series alike.
                                series={Object.fromEntries(series.map(({key, color}) => [key, {color}]))}
                                visibility={series.map(({key}) => !hidden.includes(key))}
                                dateWindow={[this.startTime(), new Date(samples[samples.length - 1].time).getTime()]}
                                valueRange={[0, 100]}
                                legend='never'
                                highlightCircleSize={0}
                                fillGraph={true}
                            />
                        )
                        : null
                    }
                </div>
            </ElementResizeDetector>
        )
    }

    renderKey(series) {
        const {hidden} = this.state
        return (
            <div className={styles.key}>
                {series.map(({key, color}) =>
                    <button
                        key={key}
                        type='button'
                        className={hidden.includes(key) ? styles.hidden : null}
                        style={{'--color': color}}
                        aria-pressed={!hidden.includes(key)}
                        onClick={() => this.toggle(key)}>
                        {msg(`user.userSession.usage.${key}`)}
                    </button>
                )}
            </div>
        )
    }

    series() {
        const {session} = this.props
        return SERIES.filter(({gpuOnly}) => !gpuOnly || session.instanceType?.gpuCount)
    }

    startTime() {
        const {session} = this.props
        return new Date(session.creationTime).getTime()
    }
}

export const SessionUsageChart = compose(
    _SessionUsageChart,
    withSubscriptions()
)

SessionUsageChart.propTypes = {
    session: PropTypes.object.isRequired
}
