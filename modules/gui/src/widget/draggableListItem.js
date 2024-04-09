import {Keybinding} from '~/widget/keybinding'
import {Portal} from '~/widget/portal'
import {animationFrames, debounceTime, distinctUntilChanged, filter, fromEvent, map, share, switchMap} from 'rxjs'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './draggableListItem.module.css'

const CLICKABLE_PAN_THRESHOLD_PX = 10

class _DraggableListItem extends React.Component {
    draggable = React.createRef()
    
    state = {
        // this draggable
        dragging: false,
        position: null,
        size: null,
        // other draggable, when over
        dragOverSize: null,
        dragOverValue: null
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
        this.onDragCancel = this.onDragCancel.bind(this)
    }

    getContent(original) {
        const {itemRenderer, item, index} = this.props
        return _.isFunction(itemRenderer)
            ? itemRenderer(item, {index, original})
            : itemRenderer
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

    isOver({coords: {x: otherX, y: otherY}}) {
        const draggable = this.draggable.current
        const {x, y, width, height} = draggable.getBoundingClientRect()
        return (otherX > x) && (otherX < x + width)
            && (otherY > y) && (otherY < y + height)
    }

    isHidden() {
        const {hidden} = this.props
        return hidden
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
        // console.log(this.state.position)
        return (
            <React.Fragment>
                {this.renderOriginal()}
                {this.isDragging() ? this.renderClone() : null}
            </React.Fragment>
        )
    }

    renderOriginal() {
        return this.renderItem(true)
    }

    renderItem(original) {
        const {showHandle, className} = this.props
        return (
            <div
                ref={original ? this.draggable : null}
                className={[
                    original ? styles.original : styles.clone,
                    this.isClickable() ? styles.clickable : null,
                    (this.isDraggable() && !this.isClickable()) ? styles.draggable : null,
                    this.isDragging() ? styles.dragging : null,
                    this.isHidden() ? styles.hidden : null,
                    className
                ].join(' ')}
                onClick={this.onClick}
                onMouseOver={this.onMouseOver}
                onMouseOut={this.onMouseOut}>
                {showHandle && this.isDraggable() ? this.renderDragHandle() : null}
                {this.getContent(original)}
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
                <Keybinding keymap={{'Escape': this.onDragCancel}}>
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
                </Keybinding>
            )
        }
    }

    initializeDraggable() {
        const {drag$, dragValue, addSubscription} = this.props
        const draggable = this.draggable.current

        const hammer = new Hammer(draggable)
        
        hammer.get('pan').set({
            direction: Hammer.DIRECTION_ALL,
            threshold: this.isClickable() ? CLICKABLE_PAN_THRESHOLD_PX : 0
        })

        const panStart$ = fromEvent(hammer, 'panstart')
        const panMove$ = fromEvent(hammer, 'panmove')
        const panEnd$ = fromEvent(hammer, 'panend')

        const thisDragStart$ = panStart$.pipe(
            map(({changedPointers}) => changedPointers[0]),
            filter(({pageX, pageY} = {}) => pageX && pageY),
            map(({pageX, pageY}) => {
                const {x: draggableX, y: draggableY, width, height} = draggable.getBoundingClientRect()
                const offset = {
                    x: pageX - draggableX,
                    y: pageY - draggableY
                }
                const coords = {
                    x: pageX,
                    y: pageY
                }
                const position = {
                    x: draggableX,
                    y: draggableY
                }
                const size = {
                    width,
                    height
                }
                return {offset, coords, position, size}
            }),
            share()
        )

        const thisDragMove$ = thisDragStart$.pipe(
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
                            x: coords.x - offset.x,
                            y: coords.y - offset.y
                        }
                    }))
                )
            )
        )

        const thisDragEnd$ = panEnd$

        const otherDrag$ = drag$.pipe(
            filter(({value}) => value !== dragValue), // ignore self events
        )

        addSubscription(
            thisDragStart$.subscribe(this.onDragStart),
            thisDragMove$.subscribe(this.onDragMove),
            thisDragEnd$.subscribe(this.onDragEnd),
            otherDrag$.subscribe(this.onOtherDrag)
        )
    }

    onDragStart({coords, position, size}) {
        const {drag$, dragValue, onDragStart} = this.props
        this.setState({dragging: true, position, size}, () => {
            drag$ && drag$.next({value: dragValue, dragStart: {size}})
            drag$ && drag$.next({value: dragValue, dragMove: {coords, position}})
            onDragStart && onDragStart(dragValue)
        })
    }

    onDragMove({coords, position}) {
        const {drag$, dragValue, onDragMove} = this.props
        this.setState({position}, () => {
            drag$ && drag$.next({value: dragValue, dragMove: {coords, position}})
            onDragMove && onDragMove(dragValue, coords)
        })
    }

    onDragCancel() {
        const {drag$, dragValue, onDragCancel} = this.props
        this.setState({dragging: false, position: null, size: null}, () => {
            drag$ && drag$.next({value: dragValue, dragCancel: true})
            onDragCancel && onDragCancel(dragValue)
        })
    }

    onDragEnd() {
        const {drag$, dragValue, onDragEnd} = this.props
        const {dragging} = this.state
        if (dragging) {
            this.setState({dragging: false, position: null, size: null}, () => {
                drag$ && drag$.next({value: dragValue, dragEnd: true})
                onDragEnd && onDragEnd(dragValue)
            })
        }
    }

    componentDidMount() {
        if (this.isDraggable()) {
            this.initializeDraggable()
        }
    }

    // other draggable

    onOtherDrag({value, dragStart, dragMove, dragEnd}) {
        dragStart && this.onOtherDragStart(value, dragStart)
        dragMove && this.onOtherDragMove(value, dragMove)
        dragEnd && this.onOtherDragEnd(value, dragEnd)
    }

    onOtherDragStart(value, {size}) {
        const {onOtherDragStart} = this.props
        this.setState({dragOverSize: size}, () => {
            onOtherDragStart && onOtherDragStart(value)
        })
    }

    onOtherDragMove(value, {coords, position}) {
        const {drag$, dragValue} = this.props
        const {dragOverValue} = this.state
        if (this.isOver({coords, position})) {
            if (dragOverValue !== value) {
                this.setState({dragOverValue: value}, () =>
                    drag$.next({value: dragValue, dragOver: {srcValue: value}})
                )
            }
        } else {
            if (dragOverValue !== null) {
                this.setState({dragOverValue: null}, () =>
                    drag$.next({value: dragValue, dragOut: {srcValue: value}})
                )
            }
        }
    }

    onOtherDragEnd(value) {
        const {onOtherDragEnd} = this.props
        const {dragOverValue} = this.state
        if (dragOverValue !== null) {
            this.setState({dragOverValue: null, dragOverSize: null}, () =>
                onOtherDragEnd && onOtherDragEnd(value)
            )
        }
    }
}

export const DraggableListItem = compose(
    _DraggableListItem,
    withSubscriptions()
)

DraggableListItem.propTypes = {
    drag$: PropTypes.object.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    dragCloneClassName: PropTypes.string,
    dragPlaceholderClassName: PropTypes.string,
    dragtooltip: PropTypes.any,
    dragValue: PropTypes.any,
    hidden: PropTypes.any,
    index: PropTypes.any,
    item: PropTypes.any,
    itemRenderer: PropTypes.func,
    showHandle: PropTypes.any,
    onClick: PropTypes.func,
    onDragCancel: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragMove: PropTypes.func,
    onDragStart: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func,
    onOtherDragEnd: PropTypes.func,
    onOtherDragStart: PropTypes.func
}
