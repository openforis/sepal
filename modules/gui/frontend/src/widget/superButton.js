import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import lookStyles from 'style/look.module.css'
import {Button, ButtonGroup} from 'widget/button'
import RemoveButton from 'widget/removeButton'
import styles from './superButton.module.css'

export default class SuperButton extends React.Component {
    state = {
        selected: false
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
        return onClick || (clickToSelect && !selected)
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

    render() {
        const {className, title, description} = this.props
        const classNames = [
            styles.container,
            lookStyles.look,
            this.isSelected() === true ? lookStyles.default : lookStyles.transparent,
            this.isInteractive() ? null : lookStyles.nonInteractive,
            className].join(' ')
        return (
            <div className={classNames}>
                <div
                    className={styles.clickTarget}
                    onClick={() => this.handleClick()}
                />
                <div className={styles.main}>
                    <div className={styles.info}>
                        <div className='itemType'>{title}</div>
                        <div className={styles.name}>{description}</div>
                    </div>
                    <div>
                        <ButtonGroup type='horizontal-nowrap'>
                            {this.renderTimestamp()}
                            {this.renderExtraButtons()}
                            {this.renderEditButton()}
                            {this.renderDuplicateButton()}
                            {this.renderRemoveButton()}
                        </ButtonGroup>
                    </div>
                </div>
                {this.renderContent()}
            </div>
        )
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

    renderContent() {
        const {children} = this.props
        return children && this.isSelected() !== false
            ? (
                <div className={styles.extra}>
                    {children}
                </div>
            )
            : null
    }
}

SuperButton.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    clickToSelect: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    duplicateTooltip: PropTypes.string,
    editTooltip: PropTypes.string,
    extraButtons: PropTypes.arrayOf(PropTypes.object),
    infoTooltip: PropTypes.string,
    removeMessage: PropTypes.string,
    removeTooltip: PropTypes.string,
    removeDisabled: PropTypes.any,
    selected: PropTypes.any,
    timestamp: PropTypes.any,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    tooltipPlacement: PropTypes.string,
    unsafeRemove: PropTypes.any,
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func,
}

SuperButton.defaultProps = {
    tooltipPlacement: 'top'
}
