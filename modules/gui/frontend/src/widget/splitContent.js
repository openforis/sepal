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

const SMOOTHING_FACTOR = .15

const resize$ = new Subject()

class _SplitContent extends React.Component {
    container = React.createRef()
    handle = React.createRef()

    state = {
        size: {},
        position: {},
        dragging: false
    }

    render() {
        const {position: {x, y}, dragging, className} = this.state
        return (
            <ElementResizeDetector onResize={size => resize$.next(size)}>
                <div
                    ref={this.container}
                    className={[
                        styles.container,
                        dragging ? styles.dragging : null,
                        className
                    ].join(' ')}
                    style={{
                        '--x': `${x}px`,
                        '--y': `${y}px`
                    }}>
                    <div className={styles.areas}>
                        {this.renderAreas()}
                    </div>
                    {this.renderHandle()}
                </div>
            </ElementResizeDetector>
        )
    }

    renderAreas() {
        const {areas} = this.props
        return areas.map(area => this.renderArea(area))
    }

    renderArea({placement, content}) {
        return (
            <div
                key={placement}
                className={[
                    styles.area,
                    styles[placement]
                ].join(' ')}>
                {content}
            </div>
        )
    }

    renderHandle() {
        const {areas} = this.props
        const showHandle = areas.length > 1
        return showHandle
            ? (
                <div
                    ref={this.handle}
                    className={styles.handle}
                />
            )
            : null
    }

    componentDidMount() {
        this.initializeResizeDetector()
        this.initializeHandle()
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
                    }
                })
            )
        )
    }

    initializeHandle() {
        const {addSubscription} = this.props

        if (!this.handle.current) {
            return
        }
        
        const handle = new Hammer(this.handle.current)
        handle.get('pan').set({direction: Hammer.DIRECTION_ALL, threshold: 0})

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
                                x: x + event.deltaX,
                                y: y + event.deltaY
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
                this.setState({dragging})
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
