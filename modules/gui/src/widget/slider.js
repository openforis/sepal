import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {ViewportResizeDetector} from 'widget/viewportResizeDetector'
import {Widget} from 'widget/widget'
import {animationFrames, combineLatest, distinctUntilChanged, fromEvent, map, merge, of, scan, switchMap, throttleTime, withLatestFrom} from 'rxjs'
import {compose} from 'compose'
import {withSubscriptions} from 'subscription'
import Hammer from 'hammerjs'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
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

const invertNormalized = (value, invert) =>
    invert ? 1 - value : value

const normalize = (value, min, max, scale, invert) =>
    invertNormalized(scale === 'log' ? normalizeLog(value, min, max) : normalizeLinear(value, min, max), invert)

const denormalize = (value, min, max, scale, invert) =>
    scale === 'log'
        ? denormalizeLog(invertNormalized(value, invert), min, max)
        : denormalizeLinear(invertNormalized(value, invert), min, max)

class SliderContainer extends React.Component {
    clickTarget = React.createRef()

    constructor() {
        super()
        this.normalize = this.normalize.bind(this)
        this.denormalize = this.denormalize.bind(this)
    }

    renderTick({position, value, label}) {
        const left = `${Math.trunc(position)}px`
        return (
            <React.Fragment key={value}>
                <div className={styles.tick} style={{left}}/>
                <div className={styles.label} style={{left}}>{label}</div>
            </React.Fragment>
        )
    }

    renderAxis() {
        const {ticks} = this.props
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

    renderDynamics() {
        const {value, width, range, decimals, ticks, snap, minValue, maxValue, invert, onChange, onPreview} = this.props
        return (
            <SliderDynamics
                value={value}
                minValue={minValue}
                maxValue={maxValue}
                width={width}
                decimals={decimals}
                ticks={ticks}
                snap={snap}
                range={range}
                invert={invert}
                clickTarget={this.clickTarget}
                normalize={this.normalize}
                denormalize={this.denormalize}
                onChange={onChange}
                onPreview={onPreview}
            />
        )
    }

    normalize(value) {
        const {scale, minValue, maxValue, invert} = this.props
        return normalize(value, minValue, maxValue, scale, invert)
    }

    denormalize(value) {
        const {scale, minValue, maxValue, invert} = this.props
        return denormalize(value, minValue, maxValue, scale, invert)
    }

    render() {
        return (
            <div>
                {this.renderAxis()}
                {this.renderClickTarget()}
                {this.renderDynamics()}
            </div>
        )
    }
}

SliderContainer.propTypes = {
    decimals: PropTypes.number,
    denormalize: PropTypes.func,
    info: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.func
    ]),
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    normalize: PropTypes.func,
    snap: PropTypes.bool,
    ticks: PropTypes.oneOfType([
        PropTypes.number,
        PropTypes.array
    ]),
    value: PropTypes.any,
    width: PropTypes.number,
    onChange: PropTypes.func
}

class _SliderDynamics extends React.Component {
    state = {
        position: null,
        previewPosition: null,
        clickTargetOffset: null,
        dragging: null,
        inhibitInput: null
    }
    handle = React.createRef()

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
        const {range, invert} = this.props
        return (
            <React.Fragment>
                {((range === 'low' && !invert) || (range === 'high' && invert)) ? this.renderLeftRange() : null}
                {((range === 'high' && !invert) || (range === 'low' && invert)) ? this.renderRightRange() : null}
            </React.Fragment>
        )
    }

    renderPreview() {
        const {previewPosition} = this.state
        return previewPosition !== null ? (
            <div className={[styles.cursor, styles.preview].join(' ')} ref={this.preview}
                style={{left: `${previewPosition}px`}}/>
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
                <Portal type='global'>
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
        this.initialize({
            handleElement: this.handle.current,
            clickTargetElement: this.props.clickTarget.current
        })
    }

    getRelativeEventPosition(e) {
        const {clickTargetOffset, handleWidth} = this.state
        return this.clampPosition(e.clientX - clickTargetOffset - handleWidth / 2)
    }

    initialize({handleElement, clickTargetElement}) {
        const {addSubscription} = this.props

        this.setState({
            handleWidth: handleElement.getBoundingClientRect().width
        })

        this.setHandlePositionByValue()

        const handle = new Hammer(handleElement)
        // limit handle movement to horizontal axis
        handle.get('pan').set({
            direction: Hammer.DIRECTION_HORIZONTAL,
            threshold: 1
        })

        const mouseMove$ = fromEvent(clickTargetElement, 'mousemove')
        const mouseLeave$ = fromEvent(clickTargetElement, 'mouseleave')
        const panStart$ = fromEvent(handle, 'panstart')
        const panMove$ = fromEvent(handle, 'panmove')
        const panEnd$ = fromEvent(handle, 'panend')

        const hoverPosition$ = merge(
            mouseMove$.pipe(
                map(e => this.getRelativeEventPosition(e))
            ),
            mouseLeave$.pipe(
                map(() => null)
            )
        )

        // target position by clicking
        const clickPosition$ = fromEvent(clickTargetElement, 'click').pipe(
            map(e => this.snapPosition(this.getRelativeEventPosition(e)))
        )

        // target position by dragging
        const dragPosition$ = panStart$.pipe(
            switchMap(() => {
                const {position} = this.state
                return merge(
                    panMove$.pipe(
                        map(event => this.clampPosition(position + event.deltaX)),
                        distinctUntilChanged()
                    ),
                    panEnd$.pipe(
                        map(() => this.snapPosition(this.state.previewPosition))
                    )
                )
            })
        )

        const handleDragging$ = merge(
            of(false),
            panStart$.pipe(map(() => true)),
            panEnd$.pipe(map(() => false)),
        )

        const targetPosition$ = merge(clickPosition$, dragPosition$)

        const handlePosition$ = targetPosition$.pipe(
            withLatestFrom(handleDragging$),
            switchMap(([targetPosition, dragging]) => {
                const {position} = this.state
                return animationFrames().pipe(
                    map(() => targetPosition),
                    scan(lerp(dragging ? .30 : .15), position),
                    map(position => Math.round(position))
                )
            }),
            distinctUntilChanged()
        )

        const handleMoving$ = handlePosition$.pipe(
            withLatestFrom(targetPosition$),
            map(([currentPosition, targetPosition]) => currentPosition !== targetPosition),
            distinctUntilChanged()
        )

        const previewPosition$ = merge(targetPosition$, hoverPosition$).pipe(
            map(position => position === null ? null : this.snapPosition(position)),
            distinctUntilChanged()
        )

        const inhibitInput$ = combineLatest([handleMoving$, handleDragging$]).pipe(
            map(([moving, dragging]) => moving || dragging),
            distinctUntilChanged()
        )

        const finalValue$ = merge(clickPosition$, panEnd$)

        const previewValue$ = targetPosition$.pipe(
            throttleTime(50, null, {leading: true, trailing: true}),
            map(targetPosition => this.toRoundedValue(targetPosition)),
            distinctUntilChanged()
        )

        addSubscription(
            handlePosition$.subscribe(position =>
                this.setHandlePosition(position)
            ),
            previewPosition$.subscribe(previewPosition =>
                this.setPreviewPosition(previewPosition)
            ),
            handleDragging$.subscribe(dragging =>
                this.setDragging(dragging)
            ),
            inhibitInput$.subscribe(inhibit =>
                this.setInhibitInput(inhibit)
            ),
            previewValue$.subscribe(targetValue => {
                this.updateTargetValue(targetValue)
            }),
            finalValue$.subscribe(() =>
                this.updateInputValue()
            )
        )
    }

    componentDidUpdate(prevProps) {
        const {inhibitInput} = this.state
        // prevent input from self-interfering during animation
        if (!inhibitInput && !_.isEqual(prevProps, this.props)) {
            this.setHandlePositionByValue()
        }
    }

    toPosition(value) {
        const {normalize, width} = this.props
        return normalize(value) * width
    }

    toValue(position) {
        const {denormalize, width} = this.props
        return denormalize(position / width)
    }

    toRoundedValue(position) {
        const {decimals} = this.props
        const value = this.toValue(this.snapPosition(position))
        const factor = Math.pow(10, decimals)
        return Math.round(value * factor) / factor
    }

    clampPosition(position) {
        const {width} = this.props
        return Math.round(
            clamp(position, {
                min: 0,
                max: width
            })
        )
    }

    snapPosition(value) {
        const {ticks, snap} = this.props
        if (snap) {
            const closest = _(ticks)
                .map(({position}) => ({position, distance: Math.abs(position - value)}))
                .sortBy('distance')
                .head()
            return Math.round(closest.position)
        } else {
            return Math.round(value)
        }
    }

    setHandlePositionByValue() {
        const {value} = this.props
        this.setHandlePosition(this.toPosition(value))
    }

    setHandlePosition(position) {
        const {position: currentPosition} = this.state
        if (position >= 0 && position !== currentPosition) {
            this.setState({position})
        }
    }

    updateInputValue() {
        const {onChange} = this.props
        const {previewPosition} = this.state
        const roundedValue = this.toRoundedValue(previewPosition)
        this.updateTargetValue(null)
        onChange && onChange(roundedValue)
    }

    updateTargetValue(targetValue) {
        const {onPreview} = this.props
        onPreview && onPreview(targetValue)
    }

    setPreviewPosition(previewPosition) {
        this.setState({previewPosition})
    }

    setInhibitInput(inhibitInput) {
        this.setState({inhibitInput})
    }

    setDragging(dragging) {
        this.setState({dragging})
    }

    setClickTargetOffset() {
        const {clickTarget} = this.props
        const {clickTargetOffset: currentClickTargetOffset} = this.state
        const clickTargetOffset = Math.trunc(clickTarget.current.getBoundingClientRect().left)
        if (currentClickTargetOffset !== clickTargetOffset) {
            this.setState({clickTargetOffset})
        }
    }
}

const SliderDynamics = compose(
    _SliderDynamics,
    withSubscriptions()
)

SliderDynamics.propTypes = {
    denormalize: PropTypes.func.isRequired,
    maxValue: PropTypes.number.isRequired,
    minValue: PropTypes.number.isRequired,
    normalize: PropTypes.func.isRequired,
    value: PropTypes.any.isRequired,
    decimals: PropTypes.number,
    invert: PropTypes.bool,
    snap: PropTypes.bool,
    ticks: PropTypes.array,
    width: PropTypes.number,
    onChange: PropTypes.func,
    onPreview: PropTypes.func
}

export class Slider extends React.Component {
    state = {
        width: null,
        ticks: [],
        minValue: null,
        maxValue: null,
        previewValue: null
    }

    constructor() {
        super()
        this.onPreview = this.onPreview.bind(this)
        this.onResize = this.onResize.bind(this)
    }

    static getDerivedStateFromProps(props, state) {
        const mapTicks = ticks =>
            ticks.map((tick, index) => {
                if (_.isObject(tick)) {
                    const value = tick.value || index
                    const label = tick.label || ''
                    return {value, label}
                }
                if (_.isString(tick)) {
                    return {value: index, externalValue: tick, label: tick}
                }
                return {value: tick, externalValue: tick, label: tick}
            })

        const ticks = mapTicks(props.ticks ? props.ticks : [props.minValue, props.maxValue])
        const minValue = props.minValue || ticks.reduce((min, {value}) => Math.min(min, value), null)
        const maxValue = props.maxValue || ticks.reduce((max, {value}) => Math.max(max, value), null)
        return {
            ticks: ticks
                .filter(({value}) => value >= minValue && value <= maxValue)
                .map(tick => ({
                    ...tick,
                    position: state.width * normalize(tick.value, minValue, maxValue, props.scale, props.invert)
                })),
            minValue,
            maxValue
        }
    }

    getDisplayValue(previewValue, fallbackValue) {
        return !_.isNil(previewValue)
            ? previewValue
            : fallbackValue
    }

    renderInfo() {
        const {value, info, alignment} = this.props
        const {ticks, previewValue} = this.state
        const tick = ticks && ticks.find(tick => tick.value === value)
        const label = this.getDisplayValue(previewValue, tick?.label || value)
        const displayValue = this.getDisplayValue(previewValue, value)
        return info ? (
            <div className={[styles.info, styles.alignment, styles[alignment]].join(' ')}>
                {_.isFunction(info) ? info(label, displayValue) : info}
            </div>
        ) : null
    }

    renderSlider() {
        const {width} = this.state
        return (
            <div className={styles.container}>
                <div className={styles.slider}>
                    <ElementResizeDetector onResize={this.onResize}/>
                    {width ? this.renderContainer() : null}
                </div>
            </div>
        )
    }

    onResize({width}) {
        this.setState({width})
    }

    renderContainer() {
        const {value, scale = 'linear', decimals = 0, snap, range = 'left', invert = false, info, onChange} = this.props
        const {ticks, minValue, maxValue, width} = this.state
        return (
            <SliderContainer
                value={value}
                minValue={minValue}
                maxValue={maxValue}
                decimals={decimals}
                ticks={ticks}
                snap={snap}
                range={range}
                scale={scale}
                invert={invert}
                info={info}
                width={width}
                onChange={onChange}
                onPreview={this.onPreview}
            />
        )

    }

    render() {
        const {label, tooltip, tooltipPlacement, alignment, disabled} = this.props
        return (
            <Widget
                className={styles.wrapper}
                label={label}
                alignment={alignment}
                disabled={disabled}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}>
                {this.renderInfo()}
                {this.renderSlider()}
            </Widget>
        )
    }

    onPreview(previewValue) {
        this.setState({previewValue})
    }
}

Slider.propTypes = {
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    decimals: PropTypes.number,
    disabled: PropTypes.any,
    info: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.func
    ]),
    invert: PropTypes.any,
    label: PropTypes.string,
    maxValue: PropTypes.number,
    minValue: PropTypes.number,
    range: PropTypes.oneOf(['none', 'low', 'high']),
    scale: PropTypes.oneOf(['linear', 'log']),
    snap: PropTypes.any,
    ticks: PropTypes.oneOfType([
        // PropTypes.number,
        PropTypes.array
    ]),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onChange: PropTypes.func
}
