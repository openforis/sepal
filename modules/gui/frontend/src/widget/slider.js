import {Label} from 'widget/form'
import {Subject, animationFrameScheduler, fromEvent, interval, merge} from 'rxjs'
import {distinctUntilChanged, filter, map, pairwise, scan, switchMap, takeUntil} from 'rxjs/operators'
// import {range} from 'collections'
import Hammer from 'hammerjs'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import ViewportResizeDetector from 'widget/viewportResizeDetector'
import _ from 'lodash'
import styles from './slider.module.css'

const clamp = (value, {min, max}) => Math.max(min, Math.min(max, value))
const lerp = (rate, speed = 1) => (value, target) => value + (target - value) * (rate * speed)

const normalizeLinear = (value, min, max) => {
    const offset = min
    return (value - offset) / (max - offset)
}

const denormalizeLinear = (value, min, max) => {
    const offset = min
    return value * (max - offset) + offset
}

const normalizeLog = (value, min, max) => {
    const offset = min - 1
    return Math.log(value - offset) / Math.log(max - offset)
}

const denormalizeLog = (value, min, max) => {
    const offset = min - 1
    return Math.exp(value * Math.log(max - offset)) + offset
}

class SliderContainer extends React.Component {
    clickTarget = React.createRef()

    normalize(value) {
        const {logScale, minValue, maxValue} = this.props
        return logScale ? normalizeLog(value, minValue, maxValue) : normalizeLinear(value, minValue, maxValue)
    }

    denormalize(value) {
        const {logScale, minValue, maxValue} = this.props
        return logScale ? denormalizeLog(value, minValue, maxValue) : denormalizeLinear(value, minValue, maxValue)
    }
    
    ticks() {
        const {ticks, width} = this.props
        return ticks.map(tick => [width * this.normalize(tick), tick])
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

    renderClickTarget() {
        return (
            <div className={styles.clickTarget} ref={this.clickTarget}/>
        )
    }

    renderDynamics(ticks) {
        const {input, minValue, maxValue, width, range} = this.props
        return (
            <SliderDynamics
                input={input}
                minValue={minValue}
                maxValue={maxValue}
                width={width}
                ticks={ticks}
                range={range}
                clickTarget={this.clickTarget}
                normalize={this.normalize.bind(this)}
                denormalize={this.denormalize.bind(this)}/>
        )
    }

    render() {
        const ticks = this.ticks()
        return (
            <div>
                {this.renderAxis(ticks)}
                {this.renderClickTarget()}
                {this.renderDynamics(ticks)}
            </div>
        )
    }
}

SliderContainer.propTypes = {
    input: PropTypes.object.isRequired,
    denormalize: PropTypes.func,
    disabled: PropTypes.any,
    info: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.func
    ]),
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    normalize: PropTypes.func,
    ticks: PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.array
    ]),
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
    handle = React.createRef()
    subscriptions = []

    renderLeftRange() {
        const {position} = this.state
        const {width} = this.props
        return <div className={styles.range} style={{right: `${width - position}px`}}/>
    }

    renderRightRange() {
        const {position} = this.state
        return <div className={styles.range} style={{left: `${position}px`}}/>
    }

    renderRanges() {
        const {range} = this.props
        return (
            <React.Fragment>
                {range === 'left' ? this.renderLeftRange() : null}
                {range === 'right' ? this.renderRightRange() : null}
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

    renderViewportResizer() {
        return (
            <ViewportResizeDetector onChange={() => this.setClickTargetOffset()}/>
        )
    }

    render() {
        return (
            <React.Fragment>
                {this.renderRanges()}
                {this.renderPreview()}
                {this.renderHandle()}
                {this.renderOverlay()}
                {this.renderViewportResizer()}
            </React.Fragment>
        )
    }

    componentDidMount() {
        const handle = new Hammer(this.handle.current, {
            threshold: 1
        })
        handle.get('pan').set({direction: Hammer.DIRECTION_HORIZONTAL})

        const click = new Hammer(this.props.clickTarget.current, {
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
                fromEvent(this.props.clickTarget.current, 'mousemove').pipe(
                    map(e => this.snapPosition(e.clientX - this.state.clickTargetOffset)),
                ),
                fromEvent(this.props.clickTarget.current, 'mouseleave').pipe(
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
        const {normalize, width} = this.props
        return normalize(value) * width
        // return scale(value, {
        //     from: {min: this.props.minValue, max: this.props.maxValue},
        //     to: {min: 0, max: this.props.width}
        // })
    }

    toValue(position) {
        const {denormalize, width} = this.props
        return denormalize(position / width)
        // return scale(position, {
        //     from: {min: 0, max: this.props.width},
        //     to: {min: this.props.minValue, max: this.props.maxValue}
        // })
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
        const clickTargetOffset = Math.trunc(this.props.clickTarget.current.getBoundingClientRect().left)
        if (this.state.clickTargetOffset !== clickTargetOffset) {
            this.setState(prevState => ({
                ...prevState,
                clickTargetOffset
            }))
        }
    }

}

SliderDynamics.propTypes = {
    denormalize: PropTypes.func.isRequired,
    input: PropTypes.object.isRequired,
    maxValue: PropTypes.number.isRequired,
    minValue: PropTypes.number.isRequired,
    normalize: PropTypes.func.isRequired,
    width: PropTypes.number.isRequired,
    ticks: PropTypes.array
}

export default class Slider extends React.Component {
    state = {
        width: null
    }

    renderInfo() {
        const {input, info} = this.props
        return info ? (
            <div className={styles.info}>
                {_.isFunction(info) ? info(input.value) : info}
            </div>
        ) : null
    }

    renderSlider() {
        const {input, minValue, maxValue, ticks, logScale, range = 'left', info, disabled} = this.props
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
                        range={range}
                        logScale={logScale}
                        info={info}
                        width={this.state.width}
                        disabled={disabled}/>
                </div>
            </div>
        )
    }

    renderDisabledOverlay() {
        const {disabled} = this.props
        return disabled ? (
            <div className={styles.disabled}/>
        ) : null
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    render() {
        return (
            <div className={styles.wrapper}>
                {this.renderLabel()}
                {this.renderInfo()}
                {this.renderSlider()}
                {this.renderDisabledOverlay()}
            </div>
        )
    }
}

Slider.propTypes = {
    input: PropTypes.object.isRequired,
    disabled: PropTypes.any,
    info: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.func
    ]),
    label: PropTypes.string,
    logScale: PropTypes.any,
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    range: PropTypes.oneOf(['none', 'left', 'right']),
    ticks: PropTypes.oneOfType([
        // PropTypes.number,
        PropTypes.array
    ]),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
