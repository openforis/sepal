import {animationFrames, distinctUntilChanged, filter, fromEvent, map, merge, scan, switchMap} from 'rxjs'
import {compose} from 'compose'
import {getLogger} from 'log'
import {withSubscriptions} from 'subscription'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const log = getLogger('splitHandle')

const SMOOTHING_FACTOR = .5

const clamp = (value, {min, max}) => Math.max(min, Math.min(max, value))

const lerp = (value, target) => value + (target - value) * Math.min(SMOOTHING_FACTOR, 1)

class _SplitHandle extends React.Component {
    ref = React.createRef()

    render() {
        const {classNames} = this.props
        return (
            <div ref={this.ref} className={classNames.join(' ')}/>
        )
    }

    componentDidMount() {
        const {name} = this.props
        log.debug('adding', name)
        this.initializeHandle()
    }

    componentWillUnmount() {
        const {name} = this.props
        log.debug('removing', name)
    }

    shouldComponentUpdate(nextProps) {
        const {classNames: nextClassNames} = nextProps
        const {classNames} = this.props
        return !_.isEqual(classNames, nextClassNames)
    }

    initializeHandle() {
        const {direction, lockDirection, onDragging, onPosition, addSubscription} = this.props
        const ref = this.ref.current

        if (!ref) {
            return
        }

        const handle = new Hammer(ref)

        handle.get('pan').set({
            direction: Hammer.DIRECTION_ALL, // fix this?
            threshold: 0
        })

        const dragLerp = (current, target) => {
            return {
                x: lerp(current.x, target.x),
                y: lerp(current.y, target.y),
            }
        }

        const hold$ = merge(
            fromEvent(ref, 'mousedown'),
            fromEvent(ref, 'touchstart')
        )
        const release$ = merge(
            fromEvent(ref, 'mouseup'),
            fromEvent(ref, 'touchend')
        )
        const pan$ = fromEvent(handle, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))

        const dragPosition$ =
            panStart$.pipe(
                switchMap(() => {
                    const {position: {x, y}} = this.props
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
                const {position} = this.props
                return animationFrames().pipe(
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
            hold$.pipe(map(() => true)),
            release$.pipe(map(() => false)),
            panStart$.pipe(map(() => true)),
            panEnd$.pipe(map(() => false)),
        )

        addSubscription(
            handlePosition$.subscribe(position =>
                onPosition(position)
            ),
            dragging$.subscribe(dragging =>
                onDragging({
                    x: dragging && direction !== 'y',
                    y: dragging && direction !== 'x'
                })
            )
        )
    }

    clampPosition({x, y}) {
        const {size: {height, width}} = this.props
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

export const SplitHandle = compose(
    _SplitHandle,
    withSubscriptions()
)

SplitHandle.propTypes = {
    classNames: PropTypes.arrayOf(PropTypes.string).isRequired,
    name: PropTypes.string.isRequired,
    position: PropTypes.object.isRequired,
    size: PropTypes.object.isRequired,
    onDragging: PropTypes.func.isRequired,
    onPosition: PropTypes.func.isRequired,
    direction: PropTypes.string,
    lockDirection: PropTypes.string
}
