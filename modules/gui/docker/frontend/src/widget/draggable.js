import {animationFrameScheduler, debounceTime, delay, distinctUntilChanged, filter, fromEvent, interval, map, switchMap} from 'rxjs'
import {compose} from 'compose'
import Hammer from 'hammerjs'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './draggable.module.css'
import withSubscriptions from 'subscription'

const CLICKABLE_PAN_THRESHOLD_PX = 10

class _Draggable extends React.Component {
    draggable = React.createRef()
    placeholder = React.createRef()

    state = {
        dragging: false,
        position: null, // position of clone when dragging
        size: null, // size of current item, used as clone size
        dragOverValue: null,
        dragOverSize: null // size of other item, user for placeholder
    }

    constructor() {
        super()
        this.onMouseOver = this.onMouseOver.bind(this)
        this.onMouseOut = this.onMouseOut.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onOtherDrag = this.onOtherDrag.bind(this)
        this.onDragStart = this.onDragStart.bind(this)
        this.onDragMove = this.onDragMove.bind(this)
        this.onDragEnd = this.onDragEnd.bind(this)
    }

    getContent() {
        const {main, children} = this.props
        return main || children
    }

    isDisabled() {
        const {disabled} = this.props
        return disabled
    }

    isClickable() {
        const {disabled, onClick} = this.props
        return !disabled && onClick
    }

    isDraggable() {
        const {disabled, drag$, onDragStart, onDrag, onDragEnd} = this.props
        return !disabled && (drag$ || onDragStart || onDrag || onDragEnd)
    }

    isDragging() {
        const {disabled, dragging} = this.state
        return !disabled && dragging
    }

    isDragOver() {
        const {dragOverValue} = this.state
        const {dragValue} = this.props
        return !_.isNil(dragOverValue) && dragOverValue !== dragValue
    }

    isOverItem(element) {
        const draggable = this.draggable.current
        return draggable && draggable.contains(element)
    }

    isOverPlaceholder(element) {
        const placeholder = this.placeholder.current
        return placeholder && placeholder.contains(element)
    }

    isOver({x, y}) {
        const element = document.elementFromPoint(x, y)
        return this.isOverItem(element) || this.isOverPlaceholder(element)
    }

    onMouseOver() {
        const {onMouseOver} = this.props
        onMouseOver && onMouseOver()
    }

    onMouseOut() {
        const {onMouseOut} = this.props
        onMouseOut && onMouseOut()
    }

    onClick() {
        const {onClick} = this.props
        if (!this.isDisabled() && !this.isDragging()) {
            onClick && onClick()
        }
    }

    render() {
        const {show} = this.props
        return (
            <React.Fragment>
                {/* {this.isDragOver() ? this.renderPlaceholder() : null} */}
                {show ? this.renderStatic() : null}
                {this.isDragging() ? this.renderClone() : null}
            </React.Fragment>
        )
    }

    renderStatic() {
        return this.renderItem(true)
    }

    renderItem(original) {
        const {showHandle} = this.props
        const {className} = this.props
        return (
            <div
                ref={original ? this.draggable : null}
                className={[
                    styles.verticalWrapper,
                    original ? styles.original : styles.clone,
                    this.isClickable() ? styles.clickable : null,
                    (this.isDragging() || this.isDraggable() && !this.isClickable()) ? styles.draggable : null,
                    this.isDragOver() ? styles.dragOver : null,
                    className
                ].join(' ')}
                onClick={this.onClick}
                onMouseOver={this.onMouseOver}
                onMouseOut={this.onMouseOut}>
                {showHandle && this.isDraggable() ? this.renderDragHandle() : null}
                <div className={styles.content}>
                    {this.getContent()}
                </div>
            </div>
        )
    }

    renderDragHandle() {
        return (
            <div className={styles.dragHandle}/>
        )
    }

    renderClone() {
        const {position, size} = this.state
        const {dragCloneClassName} = this.props
        if (position && size) {
            return (
                <Portal type='global'>
                    <div className={styles.draggableContainer}>
                        <div
                            className={[styles.draggableClone, dragCloneClassName].join(' ')}
                            style={{
                                '--x': position.x,
                                '--y': position.y,
                                '--width': size.width,
                                '--height': size.height
                            }}>
                            {this.renderItem(false)}
                        </div>
                    </div>
                </Portal>
            )
        }
    }

    renderPlaceholder() {
        const {dragOverSize} = this.state
        const {dragPlaceholderClassName} = this.props
        if (dragOverSize) {
            return (
                <div
                    ref={this.placeholder}
                    className={[styles.draggablePlaceholder, dragPlaceholderClassName].join(' ')}
                    style={{
                        '--width': dragOverSize.width,
                        '--height': dragOverSize.height
                    }}>
                </div>
            )
        }
    }

    initializeDraggable() {
        const {drag$, addSubscription} = this.props
        const draggable = this.draggable.current

        const hammer = new Hammer(draggable)
        
        hammer.get('pan').set({
            direction: Hammer.DIRECTION_ALL,
            threshold: this.isClickable() ? CLICKABLE_PAN_THRESHOLD_PX : 0
        })

        const pan$ = fromEvent(hammer, 'panstart panmove panend')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend'))
        const animationFrame$ = interval(0, animationFrameScheduler)

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
                animationFrame$.pipe(
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
            drag$.pipe(
                // filter(({value}) => value !== dragValue), // ignore self events
                // distinctUntilChanged()
            ).subscribe(this.onOtherDrag),
            dragStart$.subscribe(this.onDragStart),
            dragMove$.subscribe(this.onDragMove),
            dragEnd$.subscribe(this.onDragEnd)
        )
    }

    onDragStart({position, size}) {
        const {drag$, dragValue, onDragStart} = this.props
        this.setState({dragging: true, position, size}, () => {
            drag$ && drag$.next({value: dragValue, dragStart: {size}})
            onDragStart && onDragStart({dragValue})
        })
    }

    onDragMove({coords, position}) {
        const {drag$, dragValue} = this.props
        drag$ && drag$.next({value: dragValue, dragMove: {coords}})
        this.setState({position})
    }

    onDragEnd() {
        const {drag$, dragValue, onDragEnd} = this.props
        this.setState({dragging: false, position: null, size: null}, () => {
            drag$ && drag$.next({value: dragValue, dragEnd: true})
            onDragEnd && onDragEnd({dragValue})
        })
    }
    
    componentDidMount() {
        if (this.isDraggable()) {
            this.initializeDraggable()
        }
    }

    // other draggable

    onOtherDrag({value, dragStart, dragMove, dragOver, dragEnd}) {
        dragStart && this.onOtherDragStart(value, dragStart)
        dragMove && this.onOtherDragMove(value, dragMove)
        dragOver && this.onOtherDragOver(value, dragOver)
        dragEnd && this.onOtherDragEnd(value, dragEnd)
    }

    onOtherDragStart(value, {size}) {
        const {onOtherDragStart} = this.props
        onOtherDragStart && onOtherDragStart(value)
        this.setState({dragOverSize: size})
    }

    onOtherDragMove(value, {coords}) {
        const {drag$, dragValue} = this.props
        const {dragOverValue} = this.state
        if (this.isOver(coords)) {
            !_.isNil(dragOverValue) || this.setState({dragOverValue: value}, () =>
                drag$.next({value: dragValue, dragOver: {srcValue: value}})
            )
        } else {
            !_.isNil(dragOverValue) && this.setState({dragOverValue: null}, () =>
                drag$.next({value: dragValue, dragOut: {srcValue: value}})
            )
        }
    }

    onOtherDragOver(value, {srcValue}) {
        const {dragOverValue} = this.state
        const {dragValue} = this.props
        if (dragOverValue === srcValue && value !== dragValue) {
            this.setState({dragOverValue: null})
        }
    }

    onOtherDragEnd(value) {
        const {onOtherDragEnd} = this.props
        const {dragOverValue} = this.state
        onOtherDragEnd && onOtherDragEnd(value)
        if (!_.isNil(dragOverValue)) {
            this.setState({dragOverValue: null, dragOverSize: null})
        }
    }
}

export const Draggable = compose(
    _Draggable,
    withSubscriptions()
)

Draggable.propTypes = {
    drag$: PropTypes.object.isRequired,
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    dragCloneClassName: PropTypes.string,
    dragPlaceholderClassName: PropTypes.string,
    dragTooltip: PropTypes.string,
    dragValue: PropTypes.any,
    main: PropTypes.any,
    show: PropTypes.any,
    showHandle: PropTypes.any,
    onClick: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func,
    onOtherDragEnd: PropTypes.func,
    onOtherDragStart: PropTypes.func
}
