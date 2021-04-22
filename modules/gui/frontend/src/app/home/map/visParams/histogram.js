import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Graph} from 'widget/graph'
import {animationFrameScheduler, fromEvent, interval} from 'rxjs'
import {compose} from 'compose'
import {distinctUntilChanged, filter, map, scan, switchMap} from 'rxjs/operators'
import Hammer from 'hammerjs'
import Icon from 'widget/icon'
import React from 'react'
import _ from 'lodash'
import styles from './histogram.module.css'
import withSubscriptions from 'subscription'

export class Histogram extends React.Component {
    state = {
        width: null
    }

    render() {
        const {loading, histogram} = this.props
        if (loading) {
            return this.renderLoading()
        } else if (histogram) {
            return this.renderHistogram()
        } else {
            return <div className={styles.histogram}/>
        }
    }

    renderLoading() {
        return (
            <div className={styles.histogram}>
                <Icon name='spinner' className={styles.spinner}/>
            </div>
        )
    }

    renderHistogram() {
        const {onMinMaxChange, histogram, min, max} = this.props
        const {width} = this.state
        return (
            <div className={styles.histogram}>
                <ElementResizeDetector onResize={({width}) => this.setState({width})}>
                    <div className={styles.graph}>
                        {width
                            ? (
                                <Graph
                                    data={histogram}
                                    drawGrid={false}
                                    axes={{
                                        x: {drawAxis: false},
                                        y: {drawAxis: false}
                                    }}
                                    legend='never'
                                    highlightCircleSize={0}
                                    fillGraph={true}
                                />
                            )
                            : null
                        }
                    </div>
                </ElementResizeDetector>
                <Handles histogram={histogram} min={min} max={max} width={width} onMinMaxChange={onMinMaxChange}/>
            </div>
        )
    }
}

class Handles extends React.Component {
    state = {
        histogramMin: undefined,
        histogramMax: undefined
    }

    constructor(props) {
        super(props)
        this.onMaxPosition = this.onMaxPosition.bind(this)
        this.onMinPosition = this.onMinPosition.bind(this)
    }

    render() {
        return (

            <div className={styles.handles}>
                {this.renderHandles()}
            </div>
        )
    }

    renderHandles() {
        const {min, max, width} = this.props
        const {histogramMin, histogramMax} = this.state
        const widthFactor = width / (histogramMax - histogramMin)
        const leftWidth = Math.max(0, min - histogramMin) * widthFactor
        const rightWidth = Math.max(0, histogramMax - max) * widthFactor
        const leftPosition = leftWidth
        const rightPosition = width - rightWidth
        // Handle width - adjust based on space between left and right
        if (width) {
            return <React.Fragment>
                <div className={[styles.cropArea, styles.leftCropArea].join(' ')}>
                    <div className={styles.spacer} style={{'--width': `${leftWidth}px`}}/>
                    <Handle
                        position={leftPosition}
                        width={width}
                        onPosition={this.onMinPosition}
                    />
                </div>
                <div className={[styles.cropArea, styles.rightCropArea].join(' ')}>
                    <Handle
                        position={rightPosition}
                        width={width}
                        onPosition={this.onMaxPosition}
                    />
                    <div className={styles.spacer} style={{'--width': `${rightWidth}px`}}/>
                </div>
            </React.Fragment>
        } else {
            return null
        }
    }

    componentDidUpdate() {
        const {histogram, min, max, onMinMaxChange} = this.props
        const histogramMin = histogram[0][0]
        const histogramLastValue = histogram[histogram.length - 1][0]
        const bucketWidth = (histogramLastValue - histogramMin) / (histogram.length - 1)
        const histogramMax = histogramLastValue + bucketWidth
        this.setState(({histogramMin: prevMin, histogramMax: prevMax}) =>
            prevMin !== histogramMin || prevMax !== histogramMax
                ? {histogramMin, histogramMax}
                : null
        )
        if (!_.isFinite(min) || !_.isFinite(max)) {
            onMinMaxChange({min: histogramMin, max: histogramMax})
        }
    }

    onMinPosition(minPosition) {
        const {max, onMinMaxChange} = this.props
        const min = _.toNumber(this.positionToValue(minPosition).toPrecision(3))
        onMinMaxChange({min, max: Math.max(min, max)})
    }

    onMaxPosition(maxPosition) {
        const {min, onMinMaxChange} = this.props
        const max = _.toNumber(this.positionToValue(maxPosition).toPrecision(3))
        onMinMaxChange({min: Math.min(min, max), max})
    }

    positionToValue(position) {
        const {width} = this.props
        const {histogramMin, histogramMax} = this.state
        const widthFactor = (histogramMax - histogramMin) / width
        return histogramMin + position * widthFactor
    }
}

const SMOOTHING_FACTOR = .2
const clamp = (value, {min, max}) => Math.max(min, Math.min(max, value))
const lerp = (value, target) => value + (target - value) * Math.min(SMOOTHING_FACTOR, 1)

class _Handle extends React.Component {
    ref = React.createRef()

    render() {
        return (
            <div ref={this.ref} className={styles.handle}/>
        )
    }

    componentDidMount() {
        this.initializeHandle()
    }

    initializeHandle() {
        const {onPosition, addSubscription} = this.props
        const ref = this.ref.current
        if (!ref) {
            return
        }

        const handle = new Hammer(ref)

        handle.get('pan').set({
            direction: Hammer.DIRECTION_HORIZONTAL,
            threshold: 0
        })

        const dragLerp = (current, target) => {
            return lerp(current, target)
        }

        const pan$ = fromEvent(handle, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const animationFrame$ = interval(0, animationFrameScheduler)

        const dragPosition$ =
            panStart$.pipe(
                switchMap(() => {
                    const {position} = this.props
                    return panMove$.pipe(
                        map(event => {
                            return this.clampPosition(position + event.deltaX)
                        }),
                        distinctUntilChanged(_.isEqual),
                    )
                })
            )

        const handlePosition$ = dragPosition$.pipe(
            switchMap(targetPosition => {
                const {position} = this.props
                return animationFrame$.pipe(
                    map(() => targetPosition),
                    scan(dragLerp, position),
                    map(position => Math.round(position)),
                    distinctUntilChanged(_.isEqual)
                )
            })
        )

        addSubscription(
            handlePosition$.subscribe(position =>
                onPosition(position)
            )
        )
    }

    clampPosition(position) {
        const {width} = this.props
        const margin = 0 // TODO: Look at this
        return Math.round(
            clamp(position, {
                min: margin,
                max: width - margin
            })
        )
    }
}
const Handle = compose(
    _Handle,
    withSubscriptions()
)

