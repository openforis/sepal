import {Button, ButtonGroup} from 'widget/button'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './buttons.module.css'

export default class Buttons extends React.Component {

    isSelected(value) {
        const {multiple, input} = this.props
        return multiple
            ? Array.isArray(input.value) && input.value.includes(value)
            : input.value === value
    }

    selectSingle(value) {
        const {input} = this.props
        input.set(value)
        return value
    }

    toggleMultiple(value) {
        const {input} = this.props
        const prevValue = Array.isArray(input.value) ? input.value : []
        const nextValue = this.isSelected(value)
            ? prevValue.filter(v => v !== value)
            : [...prevValue, value]
        input.set(nextValue)
        return nextValue
    }

    select(value) {
        const {input, multiple, onChange} = this.props
        const prevValue = input.value
        const nextValue = multiple ? this.toggleMultiple(value) : this.selectSingle(value)
        if (prevValue !== nextValue)
            onChange && onChange(nextValue)

    }

    renderButton({value, label, tooltip, disabled, alwaysSelected, neverSelected}) {
        const {uppercase = true} = this.props
        return (
            <Button
                key={value}
                look={alwaysSelected || (!neverSelected && this.isSelected(value)) ? 'highlight' : 'default'}
                additionalClassName={uppercase ? styles.uppercase : null}
                disabled={disabled || alwaysSelected || neverSelected}
                tooltip={tooltip}
                tooltipPlacement='bottom'
                onClick={() => this.select(value)}
            >
                {label}
            </Button>
        )
    }

    renderButtons(options, key) {
        const {type} = this.props
        return (
            <ButtonGroup key={key} className={styles.buttons} type={type}>
                {options.map(option => this.renderButton(option))}
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

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    render() {
        const {options, className} = this.props
        return (
            <div>
                {this.renderLabel()}
                <div className={className}>
                    {options.length && options[0].options
                        ? this.renderOptionGroups(options)
                        : this.renderButtons(options)}
                </div>
            </div>
        )
    }
}

Buttons.propTypes = {
    capitalized: PropTypes.any,
    className: PropTypes.string,
    input: PropTypes.object,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}
