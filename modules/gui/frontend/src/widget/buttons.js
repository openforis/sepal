import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Widget} from 'widget/widget'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './buttons.module.css'

export class Buttons extends React.Component {
    isSelected(value) {
        const {multiple, selected} = this.props
        return multiple
            ? Array.isArray(selected) && selected.includes(value)
            : selected === value
    }

    selectSingle(value) {
        const {onChange} = this.props
        onChange && onChange(value)
        return value
    }

    toggleMultiple(value) {
        const {selected, onChange} = this.props
        const prevValue = Array.isArray(selected) ? selected : []
        const nextValue = this.isSelected(value)
            ? prevValue.filter(v => v !== value)
            : [...prevValue, value]
        onChange && onChange(nextValue)
        return nextValue
    }

    select(value) {
        const {selected, multiple, onChange} = this.props
        const prevValue = selected
        const nextValue = multiple ? this.toggleMultiple(value) : this.selectSingle(value)
        if (prevValue !== nextValue)
            onChange && onChange(nextValue)

    }

    renderButton({value, label, tooltip, disabled: buttonDisabled, alwaysSelected, neverSelected}) {
        const {chromeless, air, disabled: allDisabled, look, shape} = this.props
        const selected = !allDisabled && (alwaysSelected || (!neverSelected && this.isSelected(value)))
        return chromeless
            ? (
                <Button
                    key={value}
                    chromeless
                    look='transparent'
                    shape={shape || 'pill'}
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    label={label}
                    content={selected ? 'smallcaps-highlight' : 'smallcaps'}
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    onClick={() => this.select(value)}/>
            )
            : (
                <Button
                    key={value}
                    look={selected ? 'highlight' : look || 'default'}
                    shape={shape}
                    air={air}
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    label={label}
                    content='smallcaps'
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    onClick={() => this.select(value)}/>
            )

    }

    renderButtons(options, key) {
        const {layout} = this.props
        return (
            <ButtonGroup key={key} className={styles.buttons} layout={layout}>
                {options.map(option => this.renderButton(
                    _.isObjectLike(option)
                        ? option
                        : {value: option, label: option}
                ))}
            </ButtonGroup>
        )
    }

    renderOptionGroups(groups) {
        return (
            groups.map((group, i) =>
                this.renderButtons(group.options, group.value || group.label || i)
            )
        )
    }

    render() {
        const {label, tooltip, tooltipPlacement, disabled, options, className} = this.props
        return (
            <Widget
                className={className}
                label={label}
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

Buttons.propTypes = {
    air: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    label: PropTypes.string,
    layout: PropTypes.string,
    look: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    selected: PropTypes.any,
    shape: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    onChange: PropTypes.any,
}
