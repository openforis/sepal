import Hammer from 'hammerjs'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {animationFrameScheduler, auditTime, delay, filter, fromEvent, map, share, Subject, switchMap, take, takeUntil, timer} from 'rxjs'

import {compose} from '~/compose'
import lookStyles from '~/style/look.module.css'
import {withSubscriptions} from '~/subscription'
import {Portal} from '~/widget/portal'

import styles from './listItem.module.css'

const EXPAND_DELAYED_TIMEOUT_MS = 1000
const CLICKABLE_PAN_THRESHOLD_PX = 10

const DragPreviewContext = React.createContext(false)

// Whether this renders in the floating preview of a dragged item, which shows what is dragged rather than the controls
// it offers: those stay on the item itself, and a preview keeps the room they take.
export const useDragPreview = () => React.useContext(DragPreviewContext)

class _ListItem extends React.Component {
    draggable = React.createRef()
    dragHandle = React.createRef()
    expand$ = new Subject()

    state = {
        expanded: false,
        dragging: false,
        position: null,
        size: null
    }

    constructor(props) {
        super(props)
        this.onMouseOver = this.onMouseOver.bind(this)
        this.onMouseOut = this.onMouseOut.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onExpansionClick = this.onExpansionClick.bind(this)
        this.onDragHandleClick = this.onDragHandleClick.bind(this)
        this.onDragStart = this.onDragStart.bind(this)
        this.onDragMove = this.onDragMove.bind(this)
        this.onDragEnd = this.onDragEnd.bind(this)
    }

    getMainContent() {
        const {main, children} = this.props
        return main || children
    }

    getExpansionContent() {
        const {expansion} = this.props
        return expansion
    }

    hasExpansion() {
        return !!this.getExpansionContent()
    }

    isExpanded() {
        const {expanded: externallyExpanded} = this.props
        const {expanded: internallyExpanded} = this.state
        const expanded = _.isNil(externallyExpanded)
            ? internallyExpanded
            : externallyExpanded
        return expanded
    }

    isExpandable() {
        const {clickToExpand, clickToToggle} = this.props
        return this.hasExpansion() && !this.isExpanded() && (clickToExpand || clickToToggle)
    }

    isCollapsable() {
        const {clickToCollapse, clickToToggle} = this.props
        return this.hasExpansion() && this.isExpanded() && (clickToCollapse || clickToToggle)
    }

    isToggleable() {
        return this.isExpandable() || this.isCollapsable()
    }

    isDisabled() {
        const {disabled} = this.props
        return disabled
    }

    isClickable() {
        const {disabled, onClick} = this.props
        return !disabled && (onClick || this.isToggleable())
    }

    isDraggable() {
        const {disabled, drag$, onDragStart, onDrag, onDragEnd} = this.props
        return !disabled && (drag$ || onDragStart || onDrag || onDragEnd)
    }

    isDragging() {
        const {disabled, dragging} = this.state
        return !disabled && dragging
    }

    toggleExpansion() {
        const {onExpand} = this.props
        this.setState(
            ({expanded}) => ({expanded: !expanded}),
            () => {
                const {expanded} = this.state
                onExpand && onExpand(expanded)
                this.expand$.next(expanded)
            }
        )
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
            if (onClick) {
                onClick()
            } else if (this.isToggleable()) {
                this.toggleExpansion()
            }
        }
    }

    onDragHandleClick(e) {
        e.stopPropagation()
    }

    onExpansionClick(e) {
        const {expansionClickable} = this.props
        expansionClickable || e.stopPropagation()
    }

    // The look, on the elements that show it: the item where its expansion is clickable, otherwise its main part and
    // expansion.
    getSharedClassName(clickable) {
        const {expansionInteractive, hovered} = this.props
        return [
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.noTransitions,
            // clickable ? null : lookStyles.hoverDisabled,
            // (this.isDragging() || this.isDraggable() && !this.isClickable()) ? lookStyles.draggable : null,
            (this.isDragging() || this.isDraggable() && !clickable)
                ? lookStyles.draggable
                : clickable
                    ? null
                    : lookStyles.hoverDisabled,
            expansionInteractive
                ? lookStyles.interactive
                : null,
            this.isDisabled() ? lookStyles.disabled : null,
            hovered === false
                ? lookStyles.hoverForcedOff
                : hovered
                    ? lookStyles.hoverForcedOn
                    : null
        ]
    }

    getItemClassName() {
        const {className, expansionClickable} = this.props
        return _.flatten([
            expansionClickable ? this.getSharedClassName(this.isClickable()) : null,
            styles.verticalWrapper,
            styles.original,
            className
        ]).join(' ')
    }

    getGhostClassName() {
        const {className, expansionClickable} = this.props
        return _.flatten([
            expansionClickable ? this.getSharedClassName(this.isClickable()) : null,
            styles.verticalWrapper,
            styles.clone,
            className
        ]).join(' ')
    }

    getMainClassName() {
        const {expansionClickable} = this.props
        return _.flatten([
            expansionClickable ? null : this.getSharedClassName(this.isClickable()),
            styles.main,
            this.isExpanded() ? styles.expanded : null
        ]).join(' ')
    }

    getExpansionClassName() {
        const {expansionClickable, expansionClassName} = this.props
        return _.flatten([
            expansionClickable ? null : this.getSharedClassName(false),
            styles.expansion,
            expansionClassName
        ]).join(' ')
    }

    render() {
        return (
            <React.Fragment>
                {this.renderItem()}
                {this.isDragging() ? this.renderDraggableClone() : null}
            </React.Fragment>
        )
    }

    renderItem() {
        return (
            <div
                className={this.getItemClassName()}
                onClick={this.onClick}
                onMouseOver={this.onMouseOver}
                onMouseOut={this.onMouseOut}>
                <div className={styles.horizontalWrapper}>
                    <div ref={this.draggable}
                        className={this.getMainClassName()}>
                        {this.isDraggable() ? this.renderDragHandle(true) : null}
                        <div className={styles.content}>
                            {this.getMainContent()}
                        </div>
                    </div>
                    {this.renderExpansion()}
                </div>
            </div>
        )
    }

    renderDraggableClone() {
        const {position, size} = this.state
        const {dragCloneClassName} = this.props
        if (position && size) {
            return (
                <Portal type='global'>
                    <DragPreviewContext.Provider value={true}>
                        <div className={styles.draggableContainer}>
                            <div
                                className={[styles.draggableClone, dragCloneClassName].join(' ')}
                                style={{
                                    '--x': position.x,
                                    '--y': position.y,
                                    '--width': size.width,
                                    '--height': size.height
                                }}>
                                <div className={this.getGhostClassName()}>
                                    <div className={styles.horizontalWrapper}>
                                        <div className={this.getMainClassName()}>
                                            {this.renderDragHandle()}
                                            <div className={styles.content}>
                                                {this.getMainContent()}
                                            </div>
                                        </div>
                                        {this.renderExpansion()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </DragPreviewContext.Provider>
                </Portal>
            )
        }
    }

    renderDragHandle(original = false) {
        const {showDragHandle, dragTarget} = this.props
        const handleOnly = dragTarget === 'handle'
        // An item dragged by its whole surface can do without the grip; one dragged by the grip cannot.
        if (showDragHandle === false && !handleOnly) {
            return null
        }
        return (
            <div
                ref={original && handleOnly ? this.dragHandle : null}
                className={styles.dragHandle}
                onClick={handleOnly ? this.onDragHandleClick : null}
            />
        )
    }

    renderExpansion() {
        return this.isExpanded() ? (
            <div
                className={this.getExpansionClassName()}
                onClick={this.onExpansionClick}>
                {this.getExpansionContent()}
            </div>
        ) : null
    }

    // The item is held where it was pressed: a pan is recognised once the pointer has moved, so the press is where the
    // pan began, less the distance it has moved since. Positions are the viewport's, as the pointer's and the item's
    // are measured. The preview follows the latest position at most once an animation frame, and the position the
    // pointer is released or cancelled at is delivered before the drag ends.
    initializeDraggable() {
        const {addSubscription, dragAxis, dragPointer, dragTarget} = this.props
        const draggable = this.draggable.current
        const gestureTarget = dragTarget === 'handle' ? this.dragHandle.current : draggable

        // Hammer sets touch-action: none on whatever it listens to, which would stop a finger on the
        // item from scrolling the list around it. Listening for the mouse alone leaves that scrolling
        // to the browser, at the price of no drag by touch.
        const hammer = dragPointer === 'mouse'
            ? new Hammer(gestureTarget, {inputClass: Hammer.MouseInput, touchAction: 'auto'})
            : new Hammer(gestureTarget)

        hammer.get('pan').set({
            direction: dragAxis === 'vertical'
                ? Hammer.DIRECTION_VERTICAL
                : dragAxis === 'horizontal'
                    ? Hammer.DIRECTION_HORIZONTAL
                    : Hammer.DIRECTION_ALL,
            threshold: this.isClickable() ? CLICKABLE_PAN_THRESHOLD_PX : 0
        })

        const pan$ = fromEvent(hammer, 'panstart panmove panend pancancel')
        const panStart$ = pan$.pipe(filter(e => e.type === 'panstart'))
        const panMove$ = pan$.pipe(filter(e => e.type === 'panmove'))
        const panEnd$ = pan$.pipe(filter(e => e.type === 'panend' || e.type === 'pancancel'))

        const dragStart$ = panStart$.pipe(
            filter(({center}) => center),
            map(({center, deltaX, deltaY}) => {
                const {left, top, width, height} = draggable.getBoundingClientRect()
                const offset = {x: center.x - deltaX - left, y: center.y - deltaY - top}
                const origin = {x: left - 1, y: top - 1}
                return {
                    coords: center,
                    position: dragPosition({origin, offset, coords: center, dragAxis}),
                    size: {width, height},
                    origin,
                    offset
                }
            }),
            share()
        )

        const dragMove$ = dragStart$.pipe(
            switchMap(({origin, offset}) =>
                panMove$.pipe(
                    map(({center}) => center),
                    auditTime(0, animationFrameScheduler),
                    takeUntil(panEnd$),
                    map(coords => ({coords, position: dragPosition({origin, offset, coords, dragAxis})}))
                )
            )
        )

        const dragRelease$ = dragStart$.pipe(
            switchMap(({origin, offset}) =>
                panEnd$.pipe(
                    take(1),
                    map(({center}) => ({coords: center, position: dragPosition({origin, offset, coords: center, dragAxis})}))
                )
            )
        )

        const dragEnd$ = panEnd$.pipe(
            delay(50) // prevent click event on drag end
        )

        addSubscription(
            dragStart$.subscribe(this.onDragStart),
            dragRelease$.subscribe(this.onDragMove),
            dragMove$.subscribe(this.onDragMove),
            dragEnd$.subscribe(this.onDragEnd),
            () => hammer.destroy()
        )
    }

    onDragStart({coords, position, size}) {
        const {drag$, dragValue, onDragStart} = this.props
        this.showDragCursor(true)
        this.setState({dragging: true, position, size}, () => {
            drag$ && drag$.next({dragging: true, value: dragValue, coords})
            onDragStart && onDragStart(dragValue)
        })
    }

    // The copy under the pointer lets every event through, so without this the cursor would take its
    // shape from whatever the pointer passes over: a row, the gap between two rows, a button.
    showDragCursor(dragging) {
        document.body.classList.toggle(styles.dragCursor, dragging)
    }

    onDragMove({coords, position}) {
        const {drag$, onDrag} = this.props
        drag$ && drag$.next({coords})
        onDrag && onDrag(coords)
        this.setState({position})
    }

    onDragEnd() {
        const {drag$, onDragEnd} = this.props
        this.showDragCursor(false)
        this.setState({dragging: false, position: null, size: null}, () => {
            drag$ && drag$.next({dragging: false})
            onDragEnd && onDragEnd()
        })
    }

    initializeExpandable() {
        const {onExpandDelayed, addSubscription} = this.props
        const expanded$ = this.expand$.pipe(
            filter(expanded => expanded)
        )
        const collapsed$ = this.expand$.pipe(
            filter(expanded => !expanded)
        )

        addSubscription(
            expanded$.pipe(
                switchMap(() =>
                    timer(EXPAND_DELAYED_TIMEOUT_MS).pipe(
                        takeUntil(collapsed$)
                    )
                )
            ).subscribe(
                () => onExpandDelayed && onExpandDelayed()
            )
        )
    }

    // Only the item being dragged may reset the cursor: a virtual list unmounts other rows as the drag scrolls it.
    componentWillUnmount() {
        const {dragging} = this.state
        dragging && this.showDragCursor(false)
    }

    componentDidMount() {
        if (this.isDraggable()) {
            this.initializeDraggable()
        }
        if (this.isExpandable()) {
            this.initializeExpandable()
        }
    }
}

// Where the preview of an item held at `offset` is drawn with the pointer at `coords`: an item dragged along one axis
// keeps its place on the other.
const dragPosition = ({origin, offset, coords, dragAxis}) => ({
    x: dragAxis === 'vertical' ? origin.x : coords.x - offset.x - 1,
    y: dragAxis === 'horizontal' ? origin.y : coords.y - offset.y - 1
})

export const ListItem = compose(
    _ListItem,
    withSubscriptions()
)

ListItem.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    clickToCollapse: PropTypes.any,
    clickToExpand: PropTypes.any,
    clickToToggle: PropTypes.any,
    disabled: PropTypes.any,
    drag$: PropTypes.object,
    dragAxis: PropTypes.oneOf(['horizontal', 'vertical']),
    dragPointer: PropTypes.oneOf(['any', 'mouse']),
    dragCloneClassName: PropTypes.string,
    dragTarget: PropTypes.oneOf(['handle', 'item']),
    dragtooltip: PropTypes.any,
    dragValue: PropTypes.any,
    expanded: PropTypes.any,
    expansion: PropTypes.any,
    expansionClassName: PropTypes.string,
    expansionClickable: PropTypes.any,
    expansionInteractive: PropTypes.any,
    hovered: PropTypes.any, // three-state
    main: PropTypes.any,
    onClick: PropTypes.func,
    onDrag: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    onExpand: PropTypes.func,
    onExpandDelayed: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func,
    showDragHandle: PropTypes.bool
}
