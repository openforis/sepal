import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {Subject, animationFrameScheduler, fromEvent, interval, merge} from 'rxjs'
import {compose} from 'compose'
import {distinctUntilChanged, filter, map, mapTo, scan, switchMap} from 'rxjs/operators'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './splitContent.module.css'
import withSubscriptions from 'subscription'

const clamp = (value, {min, max}) => Math.max(min, Math.min(max, value))

const lerp = rate => (value, target) => value + (target - value) * Math.min(rate, 1)

const SMOOTHING_FACTOR = .2

const resize$ = new Subject()

class _SplitContent extends React.Component {
    centerHandle = React.createRef()
    verticalHandle = React.createRef()
    horizontalHandle = React.createRef()

    state = {
        size: {
            height: undefined,
            width: undefined
        },
        position: {
            x: undefined,
            y: undefined
        },
        handle: {
            vertical: false,
            horizontal: false,
            center: false
        },
        dragging: {
            x: false,
            y: false
        },
        initialized: false
    }

    render() {
        const {position: {x, y}, dragging, initialized, className} = this.state
        return (
            <ElementResizeDetector onResize={size => resize$.next(size)}>
                <div
                    className={[
                        styles.container,
                        dragging.x || dragging.y ? styles.dragging : null,
                        dragging.x ? styles.x : null,
                        dragging.y ? styles.y : null,
                        initialized ? styles.initialized : null,
                        className
                    ].join(' ')}
                    style={{
                        '--x': `${x}px`,
                        '--y': `${y}px`
                    }}>
                    <div className={styles.areas}>
                        {this.renderAreas()}
                    </div>
                    {this.renderCenterHandle()}
                    {this.renderVerticalHandle()}
                    {this.renderHorizontalHandle()}
                </div>
            </ElementResizeDetector>
        )
    }

    renderAreas() {
        const {areas} = this.props
        return areas.map(area => this.renderArea(area))
    }

    renderArea({placement, content}) {
        const {initialized} = this.state
        return (
            <div
                key={placement}
                className={_.flatten([
                    styles.area,
                    placement.split('-').map(placement => styles[placement])
                ]).join(' ')}>
                {initialized ? content : null}
            </div>
        )
    }

    renderCenterHandle() {
        const {handle: {center}} = this.state
        return center
            ? (
                <div
                    ref={this.centerHandle}
                    className={[
                        styles.handle,
                        styles.center
                    ].join(' ')}
                />
            )
            : null
    }

    renderVerticalHandle() {
        const {handle: {vertical}} = this.state
        const placements = this.getInterferingPlacements(['top', 'bottom'])
        return vertical
            ? (
                <div
                    ref={this.verticalHandle}
                    className={_.flatten([
                        styles.handle,
                        styles.axis,
                        styles.vertical,
                        placements.map(placement => styles[placement]),
                    ]).join(' ')}
                />
            )
            : null
    }

    renderHorizontalHandle() {
        const {handle: {horizontal}} = this.state
        const placements = this.getInterferingPlacements(['left', 'right'])
        return horizontal
            ? (
                <div
                    ref={this.horizontalHandle}
                    className={_.flatten([
                        styles.handle,
                        styles.axis,
                        styles.horizontal,
                        placements.map(placement => styles[placement]),
                    ]).join(' ')}
                />
            )
            : null
    }

    getInterferingPlacements(placements) {
        const {areas} = this.props
        return _.chain(areas)
            .map(area => area.placement)
            .intersection(placements)
            .value()
    }

    static getDerivedStateFromProps(props) {
        const hasSplit = (areas, nonSplitPlacements) =>
            _.some(areas, ({placement}) =>
                !nonSplitPlacements.includes(placement)
            )

        const calculateSplit = areas => {
            const areaCount = areas.length
            if (areaCount > 2) {
                return {
                    vertical: true,
                    horizontal: true,
                    center: true
                }
            }
            if (areaCount === 2) {
                return {
                    vertical: hasSplit(areas, ['center', 'top', 'bottom']),
                    horizontal: hasSplit(areas, ['center', 'left', 'right']),
                    center: true
                }
            }
            return {
                vertical: false,
                horizontal: false,
                center: false
            }
        }
    
        return {
            handle: calculateSplit(props.areas)
        }
    }

    componentDidMount() {
        this.initializeResizeDetector()

        const directionConstraint = () => {
            if (!this.horizontalHandle.current) {
                return 'y'
            }
            if (!this.verticalHandle.current) {
                return 'x'
            }
            return null
        }

        this.initializeHandle({
            ref: this.centerHandle,
            lockDirection: directionConstraint()
        })
        this.initializeHandle({
            ref: this.horizontalHandle,
            direction: 'y',
            lockDirection: 'x'
        })
        this.initializeHandle({
            ref: this.verticalHandle,
            direction: 'x',
            lockDirection: 'y'
        })
    }

    initializeResizeDetector() {
        const {addSubscription} = this.props

        addSubscription(
            resize$.subscribe(size =>
                this.setState({
                    size,
                    position: {
                        x: size.width / 2,
                        y: size.height / 2
                    },
                    initialized: true
                })
            )
        )
    }

    initializeHandle({ref, direction, lockDirection}) {
        const {addSubscription} = this.props

        if (!ref.current) {
            return
        }

        const handle = new Hammer(ref.current)
        handle.get('pan').set({
            direction: Hammer.DIRECTION_ALL,
            threshold: 0
        })

        const dragLerp = (current, target) => {
            const customLerp = lerp(SMOOTHING_FACTOR)
            return {
                x: customLerp(current.x, target.x),
                y: customLerp(current.y, target.y),
            }
        }

        const pan$ = fromEvent(handle, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))
        const animationFrame$ = interval(0, animationFrameScheduler)

        const dragPosition$ =
            panStart$.pipe(
                switchMap(() => {
                    const {position: {x, y}} = this.state
                    return panMove$.pipe(
                        map(event =>
                            this.clampPosition({
                                x: lockDirection === 'x' ? x : x + event.deltaX,
                                y: lockDirection === 'y' ? y : y + event.deltaY
                            })
                        ),
                        distinctUntilChanged(_.isEqual),
                    )
                })
            )

        const handlePosition$ = dragPosition$.pipe(
            switchMap(targetPosition => {
                const {position} = this.state
                return animationFrame$.pipe(
                    map(() => targetPosition),
                    scan(dragLerp, position),
                    map(({x, y}) => ({
                        x: Math.round(x),
                        y: Math.round(y)
                    })),
                    distinctUntilChanged(_.isEqual)
                )
            })
        )
        
        const dragging$ = merge(
            panStart$.pipe(mapTo(true)),
            panEnd$.pipe(mapTo(false)),
        )
        
        addSubscription(
            handlePosition$.subscribe(position =>
                this.setState({position})
            ),
            dragging$.subscribe(dragging =>
                this.setState({
                    dragging: {
                        x: dragging && direction !== 'y',
                        y: dragging && direction !== 'x'
                    }
                })
            )
        )
    }

    clampPosition({x, y}) {
        const {size: {height, width}} = this.state
        const margin = 30
        return {
            x: Math.round(
                clamp(x, {
                    min: margin,
                    max: width - margin
                })
            ),
            y: Math.round(
                clamp(y, {
                    min: margin,
                    max: height - margin
                })
            )
        }
    }
}

export const SplitContent = compose(
    _SplitContent,
    withSubscriptions()
)

SplitContent.propTypes = {
    areas: PropTypes.arrayOf(
        PropTypes.shape({
            content: PropTypes.any.isRequired,
            placement: PropTypes.oneOf(['center', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']).isRequired,
            className: PropTypes.string
        })
    )
}
