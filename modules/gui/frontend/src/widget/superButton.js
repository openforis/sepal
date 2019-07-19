import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {animationFrameScheduler, fromEvent, interval} from 'rxjs'
import {compose} from 'compose'
import {debounceTime, distinctUntilChanged, filter, map, switchMap} from 'rxjs/operators'
import Hammer from 'hammerjs'
import Highlight from 'react-highlighter'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './superButton.module.css'
import withSubscriptions from 'subscription'

class _SuperButton extends React.Component {
    ref = React.createRef()

    state = {
        selected: false,
        dragging: false,
        draggingPosition: {
            x: undefined,
            y: undefined
        }
    }

    handleClick() {
        const {onClick, clickToSelect} = this.props
        if (onClick) {
            onClick && onClick()
            return
        }
        if (clickToSelect) {
            this.setState(({selected}) => ({selected: !selected}))
            return
        }
    }

    isInteractive() {
        const {onClick, clickToSelect, selected} = this.props
        return onClick || (clickToSelect && !selected) || this.isDraggable()
    }

    isInternallySelected() {
        const {clickToSelect} = this.props
        const {selected} = this.state
        return clickToSelect
            ? selected
            : undefined
    }

    isSelected() {
        const {selected} = this.props
        return selected !== undefined
            ? selected
            : this.isInternallySelected()
    }

    isDraggable() {
        const {onDragStart, onDrag, onDragEnd} = this.props
        return onDragStart || onDrag || onDragEnd
    }

    isDragging() {
        const {dragging} = this.state
        return dragging
    }

    render() {
        return (
            <React.Fragment>
                {this.renderButton()}
                {/* {this.renderDraggable()} */}
            </React.Fragment>
        )
    }

    renderDraggable() {
        const {dragging} = this.state
        return dragging
            ? (
                <Portal>
                    {this.renderButton(dragging)}
                </Portal>
            )
            : null
    }

    renderButton(coords) {
        const {className, title, description} = this.props
        const classNames = _.flatten([
            styles.container,
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.noTransitions,
            this.isSelected() === true ? [lookStyles.hover, styles.selected] : null,
            this.isInteractive() ? null : lookStyles.nonInteractive,
            this.isDraggable() ? styles.draggable : null,
            this.isDragging() ? styles.dragging : null,
            className]).join(' ')
        return (
            <div
                // ref={this.ref}
                className={classNames}
                style={{
                    position: coords ? 'absolute' : 'inherit',
                    top: coords && coords.y,
                    left: coords && coords.x
                }}
            >
                <div className={styles.main}>
                    <div className={styles.clickTarget} onClick={() => this.handleClick()}/>
                    <div className={styles.info}>
                        <div className='itemType'>{this.renderHighlight(title)}</div>
                        <div className={styles.description}>{this.renderHighlight(description)}</div>
                    </div>
                    <ButtonGroup
                        type='horizontal-nowrap'
                        className={styles.buttons}>
                        {this.renderTimestamp()}
                        {this.renderExtraButtons()}
                        {this.renderDragButton()}
                        {this.renderEditButton()}
                        {this.renderDuplicateButton()}
                        {this.renderRemoveButton()}
                    </ButtonGroup>
                </div>
                {this.renderChildren()}
            </div>
        )
    }

    renderHighlight(content) {
        const {highlight, highlightClassName} = this.props
        return highlight
            ? (
                <Highlight
                    search={highlight}
                    ignoreDiacritics={true}
                    matchClass={highlightClassName}>
                    {content}
                </Highlight>
            )
            : content
    }

    renderTimestamp() {
        const {timestamp} = this.props
        return timestamp
            ? (
                <div className={styles.timestamp}>
                    {moment(timestamp).fromNow()}
                </div>
            )
            : null
    }

    renderExtraButtons() {
        const {extraButtons} = this.props
        return extraButtons
            ? extraButtons
            : null
    }

    renderEditButton() {
        const {onEdit, editTooltip, tooltipPlacement} = this.props
        return onEdit
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='edit'
                    tooltip={editTooltip}
                    tooltipPlacement={tooltipPlacement}
                    onClick={() => onEdit()}
                />
            )
            : null
    }

    renderDuplicateButton() {
        const {onDuplicate, duplicateTooltip, tooltipPlacement} = this.props
        return onDuplicate
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='clone'
                    tooltip={duplicateTooltip}
                    tooltipPlacement={tooltipPlacement}
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
        const {onInfo, infoTooltip, tooltipPlacement} = this.props
        return onInfo
            ? (
                <Button
                    chromeless
                    shape='circle'
                    size='large'
                    icon='info-circle'
                    tooltip={infoTooltip}
                    tooltipPlacement={tooltipPlacement}
                    onClick={() => onInfo()}/>
            )
            : null
    }

    renderDragButton() {
        const {onDragStart, onDrag, onDragEnd, dragTooltip, tooltipPlacement} = this.props
        return onDragStart || onDrag || onDragEnd
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
                <div className={styles.extra}>
                    {children}
                </div>
            )
            : null
    }

    initializeDraggable() {
        const {onDragStart, onDrag, onDragEnd} = this.props
        const {addSubscription} = this.props
        const draggable = this.ref.current
        const hammer = new Hammer(draggable)
        hammer.get('pan').set({direction: Hammer.DIRECTION_ALL})
        const pan$ = fromEvent(hammer, 'panstart panmove panend')
        const filterPanEvent = type => pan$.pipe(filter(e => e.type === type))
        const start$ = filterPanEvent('panstart')
        const move$ = filterPanEvent('panmove')
        const end$ = filterPanEvent('panend')
        const animationFrame$ = interval(0, animationFrameScheduler)
        const drag$ = start$.pipe(
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
            onDragStart && start$.subscribe(() => this.onDragStart()),
            onDrag && drag$.subscribe(e => this.onDrag(e)),
            onDragEnd && end$.subscribe(() => this.onDragEnd())
        )
    }

    onDragStart() {
        const {onDragStart} = this.props
        this.setState({dragging: true}, () => onDragStart && onDragStart())
    }

    onDrag(coords) {
        const {onDrag} = this.props
        this.setState({dragging: coords}, () => onDrag && onDrag(coords))
        onDrag && onDrag(coords)
    }

    onDragEnd() {
        const {onDragEnd} = this.props
        this.setState({dragging: false}, () => onDragEnd && onDragEnd())
    }

    componentDidMount() {
        if (this.isDraggable()) {
            this.initializeDraggable()
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
    clickToSelect: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    dragTooltip: PropTypes.string,
    duplicateTooltip: PropTypes.string,
    editTooltip: PropTypes.string,
    extraButtons: PropTypes.arrayOf(PropTypes.object),
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    infoTooltip: PropTypes.string,
    removeDisabled: PropTypes.any,
    removeMessage: PropTypes.string,
    removeTooltip: PropTypes.string,
    selected: PropTypes.any,
    timestamp: PropTypes.any,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    tooltipPlacement: PropTypes.string,
    unsafeRemove: PropTypes.any,
    onClick: PropTypes.func,
    onDrag: PropTypes.func,
    onDragEnd: PropTypes.func,
    onDragStart: PropTypes.func,
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func,
}

SuperButton.defaultProps = {
    tooltipPlacement: 'top'
}
