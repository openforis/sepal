import {Subject, animationFrames, debounceTime, delay, distinctUntilChanged, filter, fromEvent, map, switchMap, takeUntil, timer} from 'rxjs'
import {compose} from 'compose'
import {withSubscriptions} from 'subscription'
import Hammer from 'hammerjs'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './listItem.module.css'

const EXPAND_DELAYED_TIMEOUT_MS = 1000
const CLICKABLE_PAN_THRESHOLD_PX = 10

class _ListItem extends React.Component {
    draggable = React.createRef()
    expand$ = new Subject()

    state = {
        expanded: false,
        dragging: false,
        position: null,
        size: null
    }

    constructor() {
        super()
        this.onMouseOver = this.onMouseOver.bind(this)
        this.onMouseOut = this.onMouseOut.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onExpansionClick = this.onExpansionClick.bind(this)
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
        if (!this.isDisabled()) {
            if (onClick) {
                onClick()
            } else if (this.isToggleable()) {
                this.toggleExpansion()
            }
        }
    }

    onExpansionClick(e) {
        const {expansionClickable} = this.props
        expansionClickable || e.stopPropagation()
    }

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
            hovered ? lookStyles.hoverForced : null
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
                        {this.isDraggable() ? this.renderDragHandle() : null}
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
                </Portal>
            )
        }
    }

    renderDragHandle() {
        return (
            <div className={styles.dragHandle}/>
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

    initializeDraggable() {
        const {addSubscription} = this.props
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
        const {drag$, dragValue, onDragStart} = this.props
        this.setState({dragging: true, position, size}, () => {
            drag$ && drag$.next({dragging: true, value: dragValue, coords})
            onDragStart && onDragStart(dragValue)
        })
    }

    onDragMove({coords, position}) {
        const {drag$, onDrag} = this.props
        drag$ && drag$.next({coords})
        onDrag && onDrag(coords)
        this.setState({position})
    }

    onDragEnd() {
        const {drag$, onDragEnd} = this.props
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

    componentDidMount() {
        if (this.isDraggable()) {
            this.initializeDraggable()
        }
        if (this.isExpandable()) {
            this.initializeExpandable()
        }
    }
}

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
    dragCloneClassName: PropTypes.string,
    dragtooltip: PropTypes.any,
    dragValue: PropTypes.any,
    expanded: PropTypes.any,
    expansion: PropTypes.any,
    expansionClassName: PropTypes.string,
    expansionClickable: PropTypes.any,
    expansionInteractive: PropTypes.any,
    hovered: PropTypes.any,
    main: PropTypes.any,
    onClick: PropTypes.func,
    onDrag: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    onExpand: PropTypes.func,
    onExpandDelayed: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func
}
