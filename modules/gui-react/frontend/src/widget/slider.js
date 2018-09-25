import {Subject, animationFrameScheduler, fromEvent, interval, merge} from 'rxjs'
import {distinctUntilChanged, filter, map, pairwise, scan, switchMap, takeUntil} from 'rxjs/operators'
import {range} from 'collections'
import Hammer from 'hammerjs'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import ViewportResizeDetector from 'widget/viewportResizeDetector'
import _ from 'lodash'
import styles from './slider.module.css'

const clamp = (value, {min, max}) => Math.max(min, Math.min(max, value))
const scale = (value, {from, to}) => (value - from.min) * (to.max - to.min) / (from.max - from.min) + to.min
const normalize = (value, range) => scale(value, {from: range, to: {min: 0, max: 1}})
const lerp = (rate, speed = 1) => (value, target) => value + (target - value) * (rate * speed)

class SliderContainer extends React.Component {
    ticks() {
        const {ticks = 10, width} = this.props
        
        const equidistantTicks = (ticks) => range(0, ticks).map(i => i / (ticks - 1))
        
        return (Array.isArray(ticks) ? ticks : equidistantTicks(Math.max(2, ticks)))
            .map(tick => [
                width * normalize(tick, {min: this.props.minValue, max: this.props.maxValue}),
                tick
            ])
    }

    renderTick([position, value]) {
        const left = `${Math.trunc(position)}px`
        return (
            <React.Fragment key={value}>
                <div className={styles.tick} style={{left}}></div>
                <div className={styles.label} style={{left}}>{value}</div>
            </React.Fragment>
        )
    }

    renderAxis(ticks) {
        return (
            <div className={styles.axis}>
                {ticks.map(tick => this.renderTick(tick))}
            </div>
        )
    }

    render() {
        const {input, minValue, maxValue, width} = this.props
        const ticks = this.ticks()
        return (
            <div>
                {this.renderAxis(ticks)}
                <SliderDynamics
                    input={input}
                    minValue={minValue}
                    maxValue={maxValue}
                    width={width}
                    ticks={ticks}/>
            </div>
        )
    }
}

SliderContainer.propTypes = {
    input: PropTypes.object,
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    ticks: PropTypes.any,
    width: PropTypes.number
}

class SliderDynamics extends React.Component {
    state = {
        position: null,
        previewPosition: null,
        clickTargetOffset: null,
        dragging: null,
        inhibitInput: null
    }
    clickTarget = React.createRef()
    handle = React.createRef()
    subscriptions = []

    renderRanges() {
        const {position} = this.state
        const {width} = this.props
        return (
            <React.Fragment>
                <div className={[styles.range, styles.leftRange].join(' ')} style={{right: `${width - position}px`}}/>
                <div className={[styles.range, styles.rightRange].join(' ')} style={{left: `${position}px`}}/>
            </React.Fragment>
        )
    }

    renderPreview() {
        const position = this.state.previewPosition
        return position !== null ? (
            <div className={[styles.cursor, styles.preview].join(' ')} ref={this.preview}
                style={{left: `${position}px`}}/>
        ) : null
    }

    renderClickTarget() {
        return (
            <div className={styles.clickTarget} ref={this.clickTarget}/>
        )
    }

    renderHandle() {
        const {position, dragging} = this.state
        return (
            <div className={[styles.cursor, styles.handle, dragging ? styles.dragging : null].join(' ')}
                ref={this.handle}
                style={{left: `${position}px`}}/>
        )
    }

    renderOverlay() {
        const {dragging} = this.state
        return dragging
            ? (
                <Portal>
                    <div className={styles.cursorOverlay}/>
                </Portal>
            ) : null
    }

    render() {
        return (
            <React.Fragment>
                {this.renderRanges()}
                {this.renderPreview()}
                {this.renderClickTarget()}
                {this.renderHandle()}
                {this.renderOverlay()}
                <ViewportResizeDetector onChange={() => this.setClickTargetOffset()}/>
            </React.Fragment>
        )
    }

    componentDidMount() {
        const handle = new Hammer(this.handle.current, {
            threshold: 1
        })
        handle.get('pan').set({direction: Hammer.DIRECTION_HORIZONTAL})

        const click = new Hammer(this.clickTarget.current, {
            threshold: 1
        })

        const pan$ = fromEvent(handle, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))
        const animationFrame$ = interval(0, animationFrameScheduler)
        const stop$ = new Subject()

        const drag$ = panStart$.pipe(
            switchMap(() => {
                const start = this.state.position
                return merge(
                    panMove$.pipe(
                        map(pmEvent => this.clampPosition(start + pmEvent.deltaX)),
                        distinctUntilChanged(),
                        takeUntil(panEnd$)
                    ),
                    panEnd$.pipe(
                        map(() => this.snapPosition(this.state.position))
                    )
                )
            })
        )

        const click$ = fromEvent(click, 'tap').pipe(
            map(tap => this.snapPosition(tap.center.x - this.state.clickTargetOffset))
        )

        // move on click or drag
        const move$ = merge(click$, drag$).pipe(
            switchMap(cursor => {
                const start = this.state.position
                return animationFrame$.pipe(
                    map(() => cursor),
                    scan(lerp(.1), start),
                    takeUntil(stop$)
                )
            })
        )

        // enable preview on mouseover, disable on mouseleave
        this.subscriptions.push(
            merge(
                drag$.pipe(
                    map(cursor => this.snapPosition(cursor)),
                ),
                fromEvent(this.clickTarget.current, 'mousemove').pipe(
                    map(e => this.snapPosition(e.clientX - this.state.clickTargetOffset)),
                ),
                fromEvent(this.clickTarget.current, 'mouseleave').pipe(
                    map(() => null)
                )
            ).pipe(
                distinctUntilChanged()
            ).subscribe(previewPosition =>
                this.setPreviewPosition(previewPosition)
            )
        )

        // enable fullscreen pointer while dragging, disable when drag end
        this.subscriptions.push(
            merge(
                panStart$.pipe(map(() => true)),
                panEnd$.pipe(map(() => false))
            ).subscribe(dragging =>
                this.setDragging(dragging)
            )
        )

        // enable input when stopped, disabled when moving
        this.subscriptions.push(
            move$.pipe(
                pairwise(),
                map(([a, b]) => Math.abs(a - b) > .01),
                distinctUntilChanged()
            ).subscribe(status => {
                this.setInhibitInput(status)
                status === false && stop$.next()
            })
        )

        // render animation
        this.subscriptions.push(
            move$.subscribe(position =>
                this.setHandlePosition(position)
            )
        )
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }

    componentDidUpdate(prevProps) {
        if (!this.state.inhibitInput && !_.isEqual(prevProps, this.props))
            this.setHandlePosition(this.toPosition(this.props.input.value))
    }

    toPosition(value) {
        return scale(value, {
            from: {min: this.props.minValue, max: this.props.maxValue},
            to: {min: 0, max: this.props.width}
        })
    }

    toValue(position) {
        return scale(position, {
            from: {min: 0, max: this.props.width},
            to: {min: this.props.minValue, max: this.props.maxValue}
        })
    }

    clampPosition(position) {
        return clamp(position, {
            min: 0,
            max: this.props.width
        })
    }

    snapPosition(value) {
        const closest = _(this.props.ticks)
            .map(([position]) => ({position, distance: Math.abs(position - value)}))
            .sortBy('distance')
            .head()
        return closest.position
    }

    setHandlePosition(position) {
        if (position >= 0) {
            position = Math.round(position)
            if (position !== this.state.position) {
                this.setState(prevState => ({...prevState, position}))
                this.props.input.set(
                    Math.round(this.toValue(this.snapPosition(position)))
                )
            }
        }
    }

    setPreviewPosition(previewPosition) {
        this.setState(prevState => ({
            ...prevState,
            previewPosition
        }))
    }

    setInhibitInput(inhibitInput) {
        this.setState(prevState => ({...prevState, inhibitInput}))
    }

    setDragging(dragging) {
        this.setState(prevState => ({...prevState, dragging}))
    }

    setClickTargetOffset() {
        const clickTargetOffset = Math.trunc(this.clickTarget.current.getBoundingClientRect().left)
        if (this.state.clickTargetOffset !== clickTargetOffset) {
            this.setState(prevState => ({
                ...prevState,
                clickTargetOffset
            }))
        }
    }

}

SliderDynamics.propTypes = {
    input: PropTypes.object,
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    ticks: PropTypes.array,
    width: PropTypes.number
}

export default class Slider extends React.Component {
    state = {
        width: null
    }

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
                    <SliderContainer
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
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    ticks: PropTypes.any
}
