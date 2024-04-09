import {animationFrames, debounceTime, delay, distinctUntilChanged, filter, fromEvent, map, switchMap, takeUntil, timer} from 'rxjs'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _Draggable extends React.Component {
    constructor(props) {
        super(props)
        this.onDragStart = this.onDragStart.bind(this)
        this.onDragMove = this.onDragMove.bind(this)
        this.onDragEnd = this.onDragEnd.bind(this)
    }

    draggable = React.createRef()

    state = {
        position: null,
        size: null
    }

    render() {
        const {children, className, style} = this.props
        return (
            <div ref={this.draggable}
                className={className}
                style={style}>
                {children}
            </div>
        )
    }

    componentDidMount() {
        this.initializeDraggable()
    }

    initializeDraggable() {
        const {addSubscription} = this.props
        const draggable = this.draggable.current

        const hammer = new Hammer(draggable)
    
        hammer.get('pan').set({
            direction: Hammer.DIRECTION_ALL,
            threshold: 0
        })

        const pan$ = fromEvent(hammer, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))

        const dragStart$ = panStart$.pipe(
            map(({changedPointers}) => changedPointers[0]),
            filter(({pageX, pageY} = {}) => pageX && pageY),
            map(({pageX, pageY}) => {
                const {x: clientX, y: clientY, width, height} = draggable.getBoundingClientRect()
                const offset = {
                    x: Math.round(pageX - clientX),
                    y: Math.round(pageY - clientY)
                }
                return {
                    coords: {
                        x: pageX,
                        y: pageY
                    },
                    position: {
                        x: pageX - offset.x - 1,
                        y: pageY - offset.y - 1
                    },
                    size: {
                        width,
                        height
                    },
                    offset
                }
            })
        )

        const dragMove$ = dragStart$.pipe(
            switchMap(({offset}) =>
                animationFrames().pipe(
                    switchMap(() =>
                        panMove$.pipe(
                            map(e => e.center)
                        )
                    ),
                    debounceTime(10),
                    distinctUntilChanged(),
                    map(coords => ({
                        coords,
                        position: {
                            x: coords.x - offset.x - 1,
                            y: coords.y - offset.y - 1
                        }
                    }))
                )
            )
        )

        const dragEnd$ = panEnd$.pipe(
            delay(50) // prevent click event on drag end
        )

        addSubscription(
            dragStart$.subscribe(this.onDragStart),
            dragMove$.subscribe(this.onDragMove),
            dragEnd$.subscribe(this.onDragEnd)
        )
    }

    onDragStart({coords, position, size}) {
        const {drag$, onDragStart} = this.props
        this.setState({startCoords: coords, size}, () => {
            drag$ && drag$.next({dragging: true, coords, position})
            onDragStart && onDragStart({coords, position})
        })
    }

    onDragMove({coords, position}) {
        const {drag$, onDrag} = this.props
        const {startCoords} = this.state
        const delta = {x: coords.x - startCoords.x, y: coords.y - startCoords.y}
        drag$ && drag$.next({coords, delta, position})
        onDrag && onDrag({coords, delta, position})
    }

    onDragEnd() {
        const {drag$, onDragEnd} = this.props
        this.setState({startCoords: null, size: null}, () => {
            drag$ && drag$.next({dragging: false})
            onDragEnd && onDragEnd()
        })
    }
}

export const Draggable = compose(
    _Draggable,
    withSubscriptions()
)

Draggable.propTypes = {
    children: PropTypes.any,
    onDrag: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
}
