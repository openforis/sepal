import PropTypes from 'prop-types'
import React from 'react'
import Highlight from 'react-highlighter'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {CopyButton} from '~/widget/copyButton'
import {RelativeTime} from '~/widget/relativeTime'
import {RemoveButton} from '~/widget/removeButton'
import {Tooltip} from '~/widget/tooltip'

import {CheckButton} from './checkButton'
import styles from './crudItem.module.css'
import {ErrorIndicator} from './errorIndicator'
import {Icon} from './icon'
import {Layout} from './layout'

class _CrudItem extends React.Component {
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
            ? (
                <React.Fragment>
                    {this.renderError()}
                    <div className={styles.content}>{content}</div>
                </React.Fragment>
            )
            : this.renderDefaultContent()
    }

    renderDefaultContent() {
        const {title} = this.props
        return (
            <div className={styles.item}>
                {this.renderIcon()}
                {this.renderImage()}
                {this.renderInfo()}
                {title ? null : this.renderError()}
                {this.renderMetadata()}
                {this.renderTimestamp()}
                {this.renderInline()}
            </div>
        )
    }

    renderIcon() {
        const {icon, iconSize, iconType, iconVariant, iconAttributes, iconDimmed, iconTooltip, tooltipPlacement} = this.props
        return icon
            ? (
                <div className={styles.icon}>
                    <Icon
                        name={icon}
                        size={iconSize}
                        type={iconType}
                        variant={iconVariant}
                        attributes={iconAttributes}
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
        const {title, highlightTitle, titleClassName, titleTooltip, titleTooltipDisabled, titleTooltipPlacement} = this.props
        if (!title) {
            return null
        }
        const titleElement = (
            <div className={[styles.title, titleClassName].join(' ')}>
                {this.renderHighlight(title, highlightTitle)}
            </div>
        )
        // Opt-in full-title tooltip (e.g. for an ellipsized label). Default: no title tooltip, unchanged.
        const tooltipped = titleTooltip
            ? (
                <Tooltip msg={titleTooltip} placement={titleTooltipPlacement} disabled={titleTooltipDisabled}>
                    {titleElement}
                </Tooltip>
            )
            : titleElement
        const error = this.renderError()
        return error
            ? (
                <Layout
                    type='horizontal-nowrap'
                    spacing='compact'
                    alignment='left'
                    className={styles.titleRow}
                    contentClassName={styles.titleRowContent}>
                    {tooltipped}
                    {error}
                </Layout>
            )
            : tooltipped
    }

    // An item in error is marked beside its title: after it, or ahead of content its caller renders in place of one.
    renderError() {
        const {error} = this.props
        return error ? <ErrorIndicator error={error}/> : null
    }

    renderDescription() {
        const {description, highlightDescription, descriptionClassName} = this.props
        return description
            ? (
                <div className={[styles.description, descriptionClassName].join(' ')}>
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

    renderMetadata() {
        const {metadata} = this.props
        return metadata
            ? (
                <div className={styles.metadata}>
                    {metadata}
                </div>
            )
            : null
    }

    renderTimestamp() {
        const {timestamp, tooltipPlacement} = this.props
        return timestamp
            ? (
                <div className={styles.timestamp}>
                    <RelativeTime timestamp={timestamp} tooltipPlacement={tooltipPlacement}/>
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
        const {buttonSpacing} = this.props
        return (
            <ButtonGroup layout='horizontal-nowrap' spacing={buttonSpacing} className={styles.inline}>
                {this.renderInlineComponents()}
                {this.renderInfoButton()}
                {this.renderEditButton()}
                {this.renderCopyButton()}
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
                    disabled={editDisabled}
                    onClick={onEdit}
                />
            )
            : null
    }

    renderCopyButton() {
        const {copyValue, copyDisabled, copyTooltip, tooltipPlacement} = this.props
        return copyValue || copyDisabled
            ? (
                <CopyButton
                    chromeless
                    shape='circle'
                    icon='copy'
                    value={copyValue}
                    tooltip={copyTooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={copyDisabled}
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
        const {onRemove, removeTooltip, removeTitle, removeMessage, removeConfirmationLabel, removeDisabled, removePending, removeContent,
            tooltipPlacement, unsafeRemove} = this.props
        return onRemove
            ? (
                <RemoveButton
                    chromeless
                    shape='circle'
                    title={removeTitle}
                    message={removeMessage}
                    confirmationLabel={removeConfirmationLabel}
                    tooltip={removeTooltip}
                    tooltipPlacement={tooltipPlacement}
                    unsafe={unsafeRemove}
                    pending={removePending}
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

export const CrudItem = compose(
    _CrudItem,
    asFunctionalComponent({
        buttonSpacing: 'compact',
        highlightDescription: true,
        highlightTitle: true,
        tooltipPlacement: 'left'
    })
)

CrudItem.propTypes = {
    buttonSpacing: PropTypes.string,
    children: PropTypes.any,
    className: PropTypes.string,
    content: PropTypes.any,
    copyDisabled: PropTypes.any,
    copyTooltip: PropTypes.any,
    copyValue: PropTypes.string,
    description: PropTypes.any,
    descriptionClassName: PropTypes.string,
    duplicateDisabled: PropTypes.any,
    duplicateTooltip: PropTypes.any,
    editDisabled: PropTypes.any,
    // What is wrong with the item, marked beside its title and explained on hover and focus.
    error: PropTypes.any,
    editTooltip: PropTypes.any,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    highlightDescription: PropTypes.any,
    highlightTitle: PropTypes.any,
    icon: PropTypes.any,
    iconAttributes: PropTypes.any,
    iconDimmed: PropTypes.any,
    iconSize: PropTypes.any,
    iconTooltip: PropTypes.any,
    iconType: PropTypes.any,
    iconVariant: PropTypes.any,
    image: PropTypes.any,
    infoDisabled: PropTypes.any,
    infoTooltip: PropTypes.any,
    inlineComponents: PropTypes.any,
    metadata: PropTypes.any,
    removeContent: PropTypes.any,
    removeConfirmationLabel: PropTypes.string,
    removeDisabled: PropTypes.any,
    removeMessage: PropTypes.string,
    removePending: PropTypes.any,
    removeTitle: PropTypes.string,
    removeTooltip: PropTypes.any,
    selectDisabled: PropTypes.any,
    selected: PropTypes.any,
    selectTooltip: PropTypes.any,
    timestamp: PropTypes.any,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.element]),
    titleClassName: PropTypes.string,
    titleTooltip: PropTypes.any,
    titleTooltipDisabled: PropTypes.any,
    titleTooltipPlacement: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    unsafeRemove: PropTypes.any,
    onDuplicate: PropTypes.func,
    onEdit: PropTypes.func,
    onInfo: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
