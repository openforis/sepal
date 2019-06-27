import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import Highlight from 'react-highlighter'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
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
        const classNames = _.flatten([
            styles.container,
            lookStyles.look,
            lookStyles.transparent,
            lookStyles.noTransitions,
            this.isSelected() === true ? [lookStyles.hover, styles.selected] : null,
            this.isInteractive() ? null : lookStyles.nonInteractive,
            className]).join(' ')
        return (
            <div className={classNames}>
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
}

SuperButton.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    clickToSelect: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
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
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func,
}

SuperButton.defaultProps = {
    tooltipPlacement: 'top'
}
