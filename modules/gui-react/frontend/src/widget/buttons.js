import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import styles from './buttons.module.css'

export default class Buttons extends React.Component {
    // const options = [{value: 'foo', label: 'Foo'}, ...]

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
            ? prevValue.filter((v) => v !== value)
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

    renderButton(value, label, tooltip, disabled) {
        // console.log('disabled', label, disabled)
        const button =
            <li key={value}>
                <button
                    className={[
                        this.isSelected(value) ? styles.selected : null,
                        this.props.multiple ? styles.toggle : null
                    ].join(' ')}
                    disabled={disabled}
                    onClick={(e) => {
                        e.preventDefault()
                        this.select(value)
                    }}>
                    {label}
                </button>
            </li>
        return tooltip && !disabled
            ? <Tooltip key={value} msg={tooltip} below>{button}</Tooltip>
            : button
    }

    render() {
        const {options, className} = this.props
        return (
            <div className={className}>
                <ul className={styles.buttons}>
                    {options.map(({value, label, tooltip, disabled}) =>
                        this.renderButton(value, label, tooltip, disabled))}
                </ul>
            </div>
        )
    }
}

Buttons.propTypes = {
    className: PropTypes.string,
    input: PropTypes.object,
    options: PropTypes.array,
    multiple: PropTypes.any,
    onChange: PropTypes.any
}
