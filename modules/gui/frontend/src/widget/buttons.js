import {Button, ButtonGroup} from 'widget/button'
import {FormComponent} from 'widget/form'
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
        const {uppercase = true, disabled: allDisabled, size} = this.props
        const highlight = !allDisabled && (alwaysSelected || (!neverSelected && this.isSelected(value)))
        return (
            <Button
                key={value}
                size={size}
                look={highlight ? 'highlight' : 'default'}
                additionalClassName={uppercase ? styles.uppercase : null}
                disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                tooltip={tooltip}
                tooltipPlacement='bottom'
                onClick={() => this.select(value)}>
                {label}
            </Button>
        )
    }

    renderButtons(options, key) {
        const {type} = this.props
        return (
            <ButtonGroup key={key} className={styles.buttons} type={type}>
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
            <FormComponent
                className={className}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
            >
                {options.length && options[0].options
                    ? this.renderOptionGroups(options)
                    : this.renderButtons(options)}
            </FormComponent>
        )
    }
}

Buttons.propTypes = {
    capitalized: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    selected: PropTypes.any,
    size: PropTypes.oneOf(['small', 'normal', 'large', 'x-large', 'xx-large']),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}

export const FormButtons = (
    {
        capitalized, className, input, label, multiple, options, tooltip, tooltipPlacement, type, disabled, onChange
    }) =>
    <Buttons
        capitalized={capitalized}
        className={className}
        selected={input.value}
        onChange={value => {
            input.set(value)
            onChange && onChange(value)
        }}
        label={label}
        multiple={multiple}
        options={options}
        tooltip={tooltip}
        tooltipPlacement={tooltipPlacement}
        type={type}
        disabled={disabled}/>

FormButtons.propTypes = {
    capitalized: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    input: PropTypes.object,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}
