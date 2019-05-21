import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Button, ButtonGroup} from 'widget/button'
import Label from 'widget/label'
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
        onChange(value)
        return value
    }

    toggleMultiple(value) {
        const {selected, onChange} = this.props
        const prevValue = Array.isArray(selected) ? selected : []
        const nextValue = this.isSelected(value)
            ? prevValue.filter(v => v !== value)
            : [...prevValue, value]
        onChange(nextValue)
        return nextValue
    }

    select(value) {
        const {selected, multiple, onChange} = this.props
        const prevValue = selected
        const nextValue = multiple ? this.toggleMultiple(value) : this.selectSingle(value)
        if (prevValue !== nextValue)
            onChange && onChange(nextValue)

    }

    renderButton({value, label, tooltip, disabled, alwaysSelected, neverSelected}) {
        const {uppercase = true, unavailable} = this.props
        const highlight = !unavailable && (alwaysSelected || (!neverSelected && this.isSelected(value)))
        return (
            <Button
                key={value}
                look={highlight ? 'highlight' : 'default'}
                additionalClassName={uppercase ? styles.uppercase : null}
                disabled={disabled || alwaysSelected || neverSelected || unavailable}
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

    renderLabel() {
        const {label, tooltip, tooltipPlacement, unavailable} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                unavailable={unavailable}
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
    label: PropTypes.string,
    multiple: PropTypes.any,
    selected: PropTypes.any,
    options: PropTypes.array,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    unavailable: PropTypes.any,
    onChange: PropTypes.any,
}

export const FormButtons = (
    {
        capitalized, className, input, label, multiple, options, tooltip, tooltipPlacement, type, unavailable, onChange
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
        unavailable={unavailable}/>

FormButtons.propTypes = {
    capitalized: PropTypes.any,
    className: PropTypes.string,
    input: PropTypes.object,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    unavailable: PropTypes.any,
    onChange: PropTypes.any,
}
