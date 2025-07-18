import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {asFunctionalComponent} from '~/classComponent'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonSelect} from '~/widget/buttonSelect'
import {Widget} from '~/widget/widget'

import styles from './buttons.module.css'

class _Buttons extends React.Component {
    isSelected(value) {
        const {multiple, selected} = this.props
        return multiple
            ? Array.isArray(selected) && selected.includes(value)
            : selected === value
    }

    toggleMultiple(value, deselect) {
        const {selected} = this.props
        const isSelected = this.isSelected(value)
        const prevSelected = Array.isArray(selected) ? selected : []
        const nextSelected = isSelected
            ? prevSelected.filter(v => v !== value)
            : [...prevSelected, value]

        if (!isSelected && deselect) {
            return _.isArray(deselect)
                ? _.difference(nextSelected, deselect)
                : []
        }
        return nextSelected
    }

    select(value, deselect, optionValue) {
        const {selected, multiple, onChange, onSelect} = this.props
        const prevSelected = selected

        const nextSelected = multiple
            ? this.toggleMultiple(value, deselect)
            : value

        if (prevSelected !== nextSelected) {
            onChange && onChange(nextSelected, optionValue)
        }
        onSelect && onSelect(nextSelected, optionValue)
    }

    renderButton({value, look: customLook, icon, label, content, tooltip, disabled: buttonDisabled, alwaysSelected, neverSelected, deselect, options}, index) {
        const {chromeless, air, disabled: allDisabled, look, shape, size, tabIndex, width, selected} = this.props
        const optionSelected = !allDisabled && (alwaysSelected || (!neverSelected && this.isSelected(value)))
        const highlighted = optionSelected
            || deselect === true && Array.isArray(selected) && selected.length === 0
        const key = value || label || index

        if (options) {
            return (
                <ButtonSelect
                    key={key}
                    look={highlighted ? (customLook || 'highlight') : look || 'default'}
                    shape={shape}
                    size={size}
                    air={air}
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    icon={icon}
                    label={label}
                    labelStyle='smallcaps'
                    content={content}
                    options={options}
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    tabIndex={tabIndex}
                    width={width}
                    onSelect={optionValue => this.select(value, deselect, optionValue.value)}/>
            )
        }

        return chromeless
            ? (
                <Button
                    key={key}
                    chromeless
                    look={optionSelected ? (customLook || 'transparent') : 'transparent'}
                    shape={shape || 'pill'}
                    air={air}
                    size={size}
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    icon={icon}
                    label={label}
                    labelStyle={highlighted ? 'smallcaps-highlight' : 'smallcaps'}
                    content={content}
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    tabIndex={tabIndex}
                    width={width}
                    onClick={() => this.select(value, deselect)}/>
            )
            : (
                <Button
                    key={key}
                    look={highlighted ? (customLook || 'highlight') : look || 'default'}
                    shape={shape}
                    size={size}
                    air={air}
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    icon={icon}
                    label={label}
                    labelStyle='smallcaps'
                    content={content}
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    tabIndex={tabIndex}
                    width={width}
                    onClick={() => this.select(value, deselect)}/>
            )

    }

    renderButtons(options, key, label, disabled) {
        const {layout, alignment, spacing} = this.props
        return (
            <ButtonGroup
                key={key}
                className={styles.buttons}
                label={label}
                layout={layout}
                alignment={alignment}
                spacing={spacing}
                disabled={disabled}
            >
                {options.map((option, index) => this.renderButton(
                    _.isObjectLike(option) ? option : {value: option, label: option},
                    index
                ))}
            </ButtonGroup>
        )
    }

    renderOptionGroups(groups) {
        return (
            groups.map((group, i) =>
                this.renderButtons(group.options, group.value || group.label || i, group.label, group.disabled)
            )
        )
    }

    render() {
        const {label, labelButtons, tooltip, tooltipPlacement, groupSpacing, framed, disabled, options, className} = this.props
        return (
            <Widget
                className={className}
                label={label}
                labelButtons={labelButtons}
                spacing={groupSpacing}
                framed={framed}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
            >
                {options.length && options[0].options
                    ? this.renderOptionGroups(options)
                    : this.renderButtons(options)}
            </Widget>
        )
    }
}

export const Buttons = compose(
    _Buttons,
    asFunctionalComponent({
        groupSpacing: 'compact-separated'
    })
)

Buttons.propTypes = {
    air: PropTypes.any,
    alignment: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    framed: PropTypes.any,
    groupSpacing: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    layout: PropTypes.string,
    look: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.arrayOf(
        PropTypes.oneOfType([
            PropTypes.string,
            PropTypes.number,
            PropTypes.shape({
                alwaysSelected: PropTypes.any,
                content: PropTypes.any,
                deselect: PropTypes.any,
                disabled: PropTypes.any,
                icon: PropTypes.any,
                label: PropTypes.any,
                look: PropTypes.any,
                neverSelected: PropTypes.any,
                options: PropTypes.any,
                tooltip: PropTypes.any,
                value: PropTypes.any
            })
        ])
    ),
    selected: PropTypes.any,
    shape: PropTypes.string,
    size: PropTypes.string,
    spacing: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    width: PropTypes.any,
    onChange: PropTypes.any,
    onSelect: PropTypes.any
}
