import {Button, ButtonGroup} from 'widget/button'
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
        const {chromeless, uppercase = true, disabled: allDisabled} = this.props
        const selected = !allDisabled && (alwaysSelected || (!neverSelected && this.isSelected(value)))
        return chromeless
            ? (
                <Button
                    key={value}
                    chromeless
                    look='transparent'
                    shape='pill'
                    disabled={allDisabled || buttonDisabled || alwaysSelected || neverSelected}
                    tooltip={tooltip}
                    tooltipPlacement='bottom'
                    onClick={() => this.select(value)}>
                    <div className={[
                        'itemType',
                        styles.chromeless,
                        selected ? styles.selected : null,
                        uppercase ? styles.uppercase : null
                    ].join(' ')}>
                        {label}
                    </div>
                </Button>
            )
            : (
                <Button
                    key={value}
                    look={selected ? 'highlight' : 'default'}
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
    capitalized: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    selected: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}
