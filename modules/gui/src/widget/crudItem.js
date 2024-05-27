import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import Highlight from 'react-highlighter'

import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {RemoveButton} from '~/widget/removeButton'

import {CheckButton} from './checkButton'
import styles from './crudItem.module.css'
import {Icon} from './icon'

export class CrudItem extends React.Component {
    render() {
        return (
            <div className={styles.container}>
                {this.renderContent()}
                {this.renderButtons()}
            </div>
        )
    }

    getContent() {
        const {content, children} = this.props
        return content || children
    }

    renderContent() {
        const content = this.getContent()
        return content
            ? <div className={styles.content}>{content}</div>
            : this.renderDefaultContent()
    }

    renderDefaultContent() {
        return (
            <div className={styles.item}>
                {this.renderIcon()}
                {this.renderImage()}
                {this.renderInfo()}
                {this.renderTimestamp()}
                {this.renderInline()}
            </div>
        )
    }

    renderIcon() {
        const {icon, iconSize, iconType, iconVariant, iconDimmed, iconTooltip, tooltipPlacement} = this.props
        return icon
            ? (
                <div className={styles.icon}>
                    <Icon
                        name={icon}
                        size={iconSize}
                        type={iconType}
                        variant={iconVariant}
                        dimmed={iconDimmed}
                        tooltip={iconTooltip}
                        tooltipPlacement={tooltipPlacement}
                    />
                </div>
            )
            : null
    }

    renderImage() {
        const {image} = this.props
        return image
            ? (
                <div className={styles.image}>
                    {image}
                </div>
            )
            : null
    }

    renderTitle() {
        const {title, highlightTitle} = this.props
        return title
            ? (
                <div className={styles.title}>
                    {this.renderHighlight(title, highlightTitle)}
                </div>
            )
            : null
    }

    renderDescription() {
        const {description, highlightDescription} = this.props
        return description
            ? (
                <div className={styles.description}>
                    {this.renderHighlight(description, highlightDescription)}
                </div>
            )
            : null
    }

    renderInfo() {
        const {title, description} = this.props
        return title || description
            ? (
                <div className={styles.info}>
                    {this.renderTitle()}
                    {this.renderDescription()}
                </div>
            )
            : null
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

    renderInline() {
        const {children} = this.props
        return (
            <div className={styles.inline}>
                {children}
            </div>
        )
    }

    renderHighlight(content, enabled) {
        const {highlight, highlightClassName} = this.props
        return highlight && enabled
            ? (
                <Highlight
                    search={highlight}
                    ignoreDiacritics={true}
                    matchClass={highlightClassName || styles.highlight}>
                    {content}
                </Highlight>
            )
            : content
    }

    renderButtons() {
        return (
            <ButtonGroup layout='horizontal-nowrap' className={styles.inline}>
                {this.renderInlineComponents()}
                {this.renderInfoButton()}
                {this.renderEditButton()}
                {this.renderDuplicateButton()}
                {this.renderRemoveButton()}
                {this.renderSelectButton()}
            </ButtonGroup>
        )
    }

    renderInlineComponents() {
        const {inlineComponents} = this.props
        return inlineComponents
            ? inlineComponents
            : null
    }

    renderInfoButton() {
        const {infoDisabled, onInfo, infoTooltip, tooltipPlacement} = this.props
        return onInfo
            ? (
                <Button
                    chromeless
                    shape='circle'
                    icon='info-circle'
                    tooltip={infoTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={infoDisabled}
                    onClick={onInfo}
                />
            )
            : null
    }

    renderEditButton() {
        const {editDisabled, onEdit, editTooltip, tooltipPlacement} = this.props
        return onEdit
            ? (
                <Button
                    chromeless
                    shape='circle'
                    icon='edit'
                    tooltip={editTooltip}
                    tooltipPlacement={tooltipPlacement}
                    editDisabled={editDisabled}
                    onClick={onEdit}
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
                    icon='clone'
                    tooltip={duplicateTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={duplicateDisabled}
                    onClick={onDuplicate}
                />
            )
            : null
    }

    renderRemoveButton() {
        const {onRemove, removeTooltip, removeTitle, removeMessage, removeDisabled, removeContent, tooltipPlacement, unsafeRemove} = this.props
        return onRemove
            ? (
                <RemoveButton
                    chromeless
                    shape='circle'
                    title={removeTitle}
                    message={removeMessage}
                    tooltip={removeTooltip}
                    tooltipPlacement={tooltipPlacement}
                    unsafe={unsafeRemove}
                    disabled={removeDisabled}
                    onRemove={onRemove}
                >
                    {removeContent}
                </RemoveButton>
            )
            : null
    }

    renderSelectButton() {
        const {onSelect, selectTooltip, tooltipPlacement, selectDisabled, selected} = this.props
        return selected !== undefined || onSelect
            ? (
                <CheckButton
                    chromeless
                    shape='circle'
                    checked={selected}
                    tooltip={selectTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={selectDisabled || !onSelect}
                    onToggle={onSelect}
                />
            )
            : null
    }
}

CrudItem.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    content: PropTypes.any,
    description: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    duplicateDisabled: PropTypes.any,
    duplicatetooltip: PropTypes.any,
    editDisabled: PropTypes.any,
    edittooltip: PropTypes.any,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    highlightDescription: PropTypes.any,
    highlightTitle: PropTypes.any,
    icon: PropTypes.any,
    iconDimmed: PropTypes.any,
    iconSize: PropTypes.any,
    iconTooltip: PropTypes.any,
    iconType: PropTypes.any,
    iconVariant: PropTypes.any,
    image: PropTypes.any,
    infoDisabled: PropTypes.any,
    infoTooltip: PropTypes.any,
    inlineComponents: PropTypes.any,
    removeContent: PropTypes.any,
    removeDisabled: PropTypes.any,
    removeMessage: PropTypes.string,
    removeTitle: PropTypes.string,
    removetooltip: PropTypes.any,
    selectDisabled: PropTypes.any,
    selected: PropTypes.any,
    selectTooltip: PropTypes.any,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    tooltipPlacement: PropTypes.string,
    unsafeRemove: PropTypes.any,
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}

CrudItem.defaultProps = {
    highlightDescription: true,
    highlightTitle: true,
    tooltipPlacement: 'left'
}
