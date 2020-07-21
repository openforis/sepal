import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Item} from 'widget/item'
import {Subject, animationFrameScheduler, fromEvent, interval, timer} from 'rxjs'
import {compose} from 'compose'
import {debounceTime, distinctUntilChanged, filter, map, switchMap, takeUntil} from 'rxjs/operators'
import Hammer from 'hammerjs'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './superButton.module.css'
import withSubscriptions from 'subscription'

const EXPAND_DELAYED_TIMEOUT_MS = 1000

class _SuperButton extends React.Component {
    ref = React.createRef()
    expand$ = new Subject()

    state = {
        expanded: false,
        dragging: false
    }

    isExpandable() {
        const {clickToExpand, children} = this.props
        return clickToExpand && children
    }

    isInteractive() {
        const {disabled, onClick, expanded} = this.props
        return !disabled && (onClick || (this.isExpandable() && !expanded) || this.isDraggable())
    }

    isInternallySelected() {
        const {expanded} = this.state
        return this.isExpandable()
            ? expanded
            : undefined
    }

    isSelected() {
        const {expanded} = this.props
        return expanded !== undefined
            ? expanded
            : this.isInternallySelected()
    }

    isDraggable() {
        const {disabled, drag$, onDragStart, onDrag, onDragEnd} = this.props
        return !disabled && (drag$ || onDragStart || onDrag || onDragEnd)
    }

    isDragging() {
        const {disabled, dragging} = this.state
        return !disabled && dragging
    }

    onClick() {
        const {onClick} = this.props
        onClick && onClick()
    }

    clickToExpand() {
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

    handleClick() {
        const {disabled, onClick} = this.props
        if (!disabled) {
            if (onClick) {
                this.onClick()
            } else if (this.isExpandable()) {
                this.clickToExpand()
            }
        }
    }

    renderDefaultContent() {
        const {title, description, image, timestamp, highlight, highlightClassName, highlightTitle, highlightDescription} = this.props
        return (
            <Item
                className={styles.content}
                title={title}
                description={description}
                image={image}
                timestamp={timestamp}
                highlight={highlight}
                highlightClassName={highlightClassName}
                highlightTitle={highlightTitle}
                highlightDescription={highlightDescription}
            />
        )
    }

    renderContent() {
        const {content} = this.props
        return content
            ? <div className={styles.content}>{content}</div>
            : this.renderDefaultContent()
    }

    renderButtons() {
        return (
            <ButtonGroup
                layout='horizontal-nowrap'
                className={styles.inline}
            >
                {this.renderInlineComponents()}
                {/* {this.renderDragButton()} */}
                {this.renderInfoButton()}
                {this.renderEditButton()}
                {this.renderDuplicateButton()}
                {this.renderRemoveButton()}
            </ButtonGroup>
        )
    }

    render() {
        const {className} = this.props
        const classNames = _.flatten([
            styles.container,
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.noTransitions,
            this.isSelected() === true ? [lookStyles.hover, styles.expanded] : null,
            this.isInteractive() ? null : lookStyles.nonInteractive,
            this.isDraggable() ? styles.draggable : null,
            this.isDragging() ? styles.dragging : null,
            className
        ]).join(' ')
        return (
            <div className={classNames} ref={this.ref}>
                <div className={styles.main}>
                    <div className={styles.clickTarget} onClick={() => this.handleClick()}/>
                    {this.renderContent()}
                    {this.renderButtons()}
                </div>
                {this.renderChildren()}
            </div>
        )
    }

    renderInlineComponents() {
        const {inlineComponents} = this.props
        return inlineComponents
            ? inlineComponents
            : null
    }

    renderEditButton() {
        const {editDisabled, onEdit, editTooltip, tooltipPlacement} = this.props
        return onEdit
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='edit'
                    tooltip={editTooltip}
                    tooltipPlacement={tooltipPlacement}
                    editDisabled={editDisabled}
                    onClick={() => onEdit()}
                />
            )
            : null
    }

    renderDuplicateButton() {
        const {duplicateDisabled, onDuplicate, duplicateTooltip, tooltipPlacement} = this.props
        return onDuplicate
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='clone'
                    tooltip={duplicateTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={duplicateDisabled}
                    onClick={() => onDuplicate()}/>
            )
            : null
    }

    renderRemoveButton() {
        const {onRemove, removeTooltip, removeMessage, removeDisabled, tooltipPlacement, unsafeRemove} = this.props
        return onRemove
            ? (
                <RemoveButton
                    message={removeMessage}
                    tooltip={removeTooltip}
                    tooltipPlacement={tooltipPlacement}
                    unsafe={unsafeRemove}
                    disabled={removeDisabled}
                    onRemove={() => onRemove()}/>
            )
            : null
    }

    renderInfoButton() {
        const {infoDisabled, onInfo, infoTooltip, tooltipPlacement} = this.props
        return onInfo
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='info-circle'
                    tooltip={infoTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={infoDisabled}
                    onClick={() => onInfo()}/>
            )
            : null
    }

    renderDragButton() {
        const {dragTooltip, tooltipPlacement} = this.props
        return this.isDraggable()
            ? (
                <Button
                    ref={this.ref}
                    chromeless
                    shape='circle'
                    size='large'
                    icon='arrows-alt'
                    additionalClassName={styles.dragHandle}
                    tooltip={dragTooltip}
                    tooltipPlacement={tooltipPlacement}
                    onClick={() => null}/>
            )
            : null
    }

    renderChildren() {
        const {children} = this.props
        return children && this.isSelected() !== false
            ? (
                <div className={styles.expand}>
                    {children}
                </div>
            )
            : null
    }

    initializeDraggable() {
        const {addSubscription} = this.props
        const draggable = this.ref.current
        const hammer = new Hammer(draggable)
        hammer.get('pan').set({direction: Hammer.DIRECTION_ALL})
        const pan$ = fromEvent(hammer, 'panstart panmove panend')
        const filterPanEvent = type => pan$.pipe(filter(e => e.type === type))
        const dragStart$ = filterPanEvent('panstart')
        const move$ = filterPanEvent('panmove')
        const dragEnd$ = filterPanEvent('panend')
        const animationFrame$ = interval(0, animationFrameScheduler)
        const dragMove$ = dragStart$.pipe(
            switchMap(() =>
                animationFrame$.pipe(
                    switchMap(() =>
                        move$.pipe(
                            map(e => e.center)
                        )),
                    debounceTime(10),
                    distinctUntilChanged()
                )
            )
        )
        
        addSubscription(
            dragStart$.subscribe(() => this.onDragStart()),
            dragMove$.subscribe(coords => this.onDragMove(coords)),
            dragEnd$.subscribe(() => this.onDragEnd())
        )
    }

    onDragStart() {
        const {drag$, dragValue, onDragStart} = this.props
        this.setState({dragging: true}, () => {
            drag$ && drag$.next({dragging: true, value: dragValue})
            onDragStart && onDragStart(dragValue)
        })
    }

    onDragMove(coords) {
        const {drag$, onDrag} = this.props
        drag$ && drag$.next({coords})
        onDrag && onDrag(coords)
    }

    onDragEnd() {
        const {drag$, onDragEnd} = this.props
        this.setState({dragging: false}, () => {
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

export const SuperButton = compose(
    _SuperButton,
    withSubscriptions()
)

SuperButton.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    clickToExpand: PropTypes.any,
    content: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    disabled: PropTypes.any,
    drag$: PropTypes.object,
    dragTooltip: PropTypes.string,
    dragValue: PropTypes.any,
    duplicateDisabled: PropTypes.any,
    duplicateTooltip: PropTypes.string,
    editDisabled: PropTypes.any,
    editTooltip: PropTypes.string,
    expanded: PropTypes.any,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    highlightDescription: PropTypes.any,
    highlightTitle: PropTypes.any,
    image: PropTypes.any,
    infoDisabled: PropTypes.any,
    infoTooltip: PropTypes.string,
    inlineComponents: PropTypes.any,
    removeDisabled: PropTypes.any,
    removeMessage: PropTypes.string,
    removeTooltip: PropTypes.string,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    tooltipPlacement: PropTypes.string,
    unsafeRemove: PropTypes.any,
    onClick: PropTypes.func,
    onDrag: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onExpand: PropTypes.func,
    onExpandDelayed: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func
}

SuperButton.defaultProps = {
    tooltipPlacement: 'top'
}
