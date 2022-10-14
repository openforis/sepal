import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {CheckButton} from './checkButton'
import {Item} from 'widget/item'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import styles from './crudItem.module.css'

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
        const {title, description, icon, iconSize, iconType, iconVariant, image, timestamp, highlight, highlightClassName, highlightTitle, highlightDescription, onClick} = this.props
        return (
            <Item
                className={styles.content}
                title={title}
                description={description}
                icon={icon}
                iconSize={iconSize}
                iconType={iconType}
                iconVariant={iconVariant}
                image={image}
                timestamp={timestamp}
                highlight={highlight}
                highlightClassName={highlightClassName}
                highlightTitle={highlightTitle}
                highlightDescription={highlightDescription}
                nonClickable={!onClick}
            />
        )
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
                    size='large'
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
                    size='large'
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
                    size='large'
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
                    size='large'
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
                    size='large'
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
    duplicateTooltip: PropTypes.string,
    editDisabled: PropTypes.any,
    editTooltip: PropTypes.string,
    highlight: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    highlightClassName: PropTypes.string,
    highlightDescription: PropTypes.any,
    highlightTitle: PropTypes.any,
    icon: PropTypes.any,
    iconSize: PropTypes.any,
    iconType: PropTypes.any,
    iconVariant: PropTypes.any,
    image: PropTypes.any,
    infoDisabled: PropTypes.any,
    infoTooltip: PropTypes.string,
    inlineComponents: PropTypes.any,
    removeContent: PropTypes.any,
    removeDisabled: PropTypes.any,
    removeMessage: PropTypes.string,
    removeTitle: PropTypes.string,
    removeTooltip: PropTypes.string,
    selectDisabled: PropTypes.any,
    selected: PropTypes.any,
    selectTooltip: PropTypes.string,
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
    tooltipPlacement: 'left'
}
