import {range} from 'collections'
import Hammer from 'hammerjs'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import ReactResizeDetector from 'react-resize-detector'
import {animationFrameScheduler, fromEvent, interval, merge} from 'rxjs'
import {distinctUntilChanged, filter, map, scan, switchMap, takeUntil} from 'rxjs/operators'
import styles from './slider.module.css'

const clamp = ({value, min, max}) => Math.max(min, Math.min(max, value))
const scale = ({value, from, to}) => (value - from.min) * (to.max - to.min) / (from.max - from.min) + to.min

class Draggable extends React.Component {
    state = {}
    element = React.createRef()
    subscription = null

    ticksPosition(ticks) {
        return Array.isArray(ticks) ? ticks : range(0, ticks + 1).map(i => i / ticks)
    }

    renderAxis(ticks) {
        return (
            <div className={styles.axis}>
                {this.ticksPosition(ticks).map(position =>
                    <div key={position} style={{left: `${Math.trunc(position * this.props.width)}px`}}/>
                )}
            </div>
        )
    }

    render() {
        const position = this.state.position
        const width = this.props.width
        return (
            <div>
                {this.renderAxis(this.props.ticks)}
                <div className={[styles.range, styles.leftRange].join(' ')} style={{right: `${width - position}px`}}/>
                <div className={[styles.range, styles.rightRange].join(' ')} style={{left: `${position}px`}}/>
                <div className={styles.handle} ref={this.element} style={{left: `${position}px`}}/>
                {this.state.dragging
                    ? ReactDOM.createPortal(
                        <div className={styles.cursorOverlay}/>,
                        document.body
                    )
                    : null
                }

            </div>
        )
    }

    componentDidUpdate(prevProps) {
        if (!this.state.dragging && !_.isEqual(prevProps, this.props))
            this.setPosition(this.toPosition(this.props.input.value))
    }

    componentWillUnmount() {
        this.subscription && this.subscription.unsubscribe()
    }

    toPosition(value) {
        return scale({
            value,
            from: {min: this.props.minValue, max: this.props.maxValue},
            to: {min: 0, max: this.props.width}
        })
    }

    toValue(position) {
        return scale({
            value: position,
            from: {min: 0, max: this.props.width},
            to: {min: this.props.minValue, max: this.props.maxValue}
        })
    }

    clampPosition(position) {
        return clamp({
            value: position,
            min: 0,
            max: this.props.width
        })
    }

    snapPosition(value) {
        if (Array.isArray(this.props.ticks)) {
            const closest = _(this.props.ticks)
                .map(tick => tick * this.props.width)
                .map(position => ({position, distance: Math.abs(position - value)}))
                .sortBy('distance')
                .head()
            return closest.position
        }
        if (Number.isInteger(this.props.ticks)) {
            const stepSize = this.props.width / this.props.ticks
            const step = Math.round(value / stepSize)
            return step * stepSize
        }
        return value
    }

    setPosition(position) {
        if (position >= 0) {
            position = Math.round(position)
            if (position !== this.state.position) {
                this.setState(prevState => ({...prevState, position}))
                this.props.input.set(
                    Math.round(
                        this.toValue(
                            this.snapPosition(position)
                        )
                    )
                )
            }
        }
    }

    setDragging(dragging) {
        this.setState(prevState => ({...prevState, dragging}))
    }

    componentDidMount() {
        const drag$ = (element) => {
            const hammerPan = new Hammer(element, {
                threshold: 1
            })
            hammerPan.get('pan').set({direction: Hammer.DIRECTION_HORIZONTAL})

            const pan$ = fromEvent(hammerPan, 'panstart panmove panend')
            const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
            const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
            const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))
            const animationFrame$ = interval(0, animationFrameScheduler)

            const lerp = (rate, speed) => {
                return (value, targetValue) => {
                    const delta = (targetValue - value) * (rate * speed)
                    return value + delta
                }
            }

            return panStart$.pipe(
                switchMap(() => {
                    const start = this.state.position
                    return merge(
                        panMove$.pipe(
                            map(pmEvent => {
                                this.setDragging(true)
                                return ({
                                    cursor: this.clampPosition(start + pmEvent.deltaX),
                                    speed: 1 - Math.max(0, Math.min(95, Math.abs(pmEvent.deltaY))) / 100
                                })
                            }),
                            distinctUntilChanged(),
                            takeUntil(panEnd$)
                        ),
                        panEnd$.pipe(
                            map(() => {
                                this.setDragging(false)
                                return ({
                                    cursor: this.snapPosition(this.state.position),
                                    speed: 1
                                })
                            })
                        )
                    )
                }),
                switchMap(({cursor, speed}) => {
                    const start = this.state.position
                    return animationFrame$.pipe(
                        map(() => cursor),
                        scan(lerp(.2, speed), start),
                        distinctUntilChanged((a, b) => Math.abs(a - b) < .01),
                        takeUntil(panEnd$)
                    )
                })
            )
        }

        this.subscription = drag$(this.element.current).subscribe((position) => this.setPosition(position))
    }
}

Draggable.propTypes = {
    input: PropTypes.object,
    minValue: PropTypes.number,
    maxValue: PropTypes.number,
    ticks: PropTypes.any,
    width: PropTypes.number
}

export default class Slider extends React.Component {
    state = {}

    render() {
        const {input, minValue, maxValue, ticks} = this.props
        return (
            <div className={styles.container}>
                <div className={styles.slider}>
                    <ReactResizeDetector
                        handleWidth
                        onResize={width => {
                            return this.setState(prevState => ({...prevState, width}))
                        }}/>
                    <Draggable
                        input={input}
                        minValue={minValue !== undefined ? minValue : 0}
                        maxValue={maxValue !== undefined ? maxValue : 100}
                        ticks={ticks}
                        width={this.state.width}/>
                </div>
            </div>
        )
    }
}

Slider.propTypes = {
    input: PropTypes.object.isRequired,
    minValue: PropTypes.number,
    maxValue: PropTypes.number,
    ticks: PropTypes.any
}
