import {Button, ButtonGroup} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './superButton.module.css'

export default class SuperButton extends React.Component {
    render() {
        const {className, title, description, onClick} = this.props
        const classNames = [
            styles.container,
            lookStyles.look,
            lookStyles.transparent,
            onClick ? null : lookStyles.nonInteractive,
            className].join(' ')
        return (
            <div className={classNames}>
                <div
                    className={styles.clickTarget}
                    onClick={() => onClick && onClick()}
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
        const {onRemove, removeTooltip, removeMessage, tooltipPlacement, unsafeRemove} = this.props
        return onRemove
            ? (
                <RemoveButton
                    message={removeMessage}
                    tooltip={removeTooltip}
                    tooltipPlacement={tooltipPlacement}
                    onRemove={() => onRemove()}
                    unsafe={unsafeRemove}/>
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
        return children
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
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    duplicateTooltip: PropTypes.string,
    editTooltip: PropTypes.string,
    extraButtons: PropTypes.arrayOf(PropTypes.object),
    infoTooltip: PropTypes.string,
    removeMessage: PropTypes.string,
    removeTooltip: PropTypes.string,
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
    tooltipPlacement: 'bottom'
}
