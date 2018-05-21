import PropTypes from 'prop-types'
import React from 'react'
import styles from './buttons.module.css'
import Tooltip from 'widget/tooltip'

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
    }

    toggleMultiple(value) {
        const {input} = this.props
        const currentValue = Array.isArray(input.value) ? input.value : []
        input.set(
            this.isSelected(value)
                ? currentValue.filter((v) => v !== value)
                : [...currentValue, value]
        )
    }

    select(value) {
        const {multiple} = this.props
        multiple ? this.toggleMultiple(value) : this.selectSingle(value)
    }

    renderButton(value, label, tooltip) {
        const button =
            <li key={value}>
                <button
                    className={this.isSelected(value) ? styles.selected : null}
                    onClick={(e) => {
                        e.preventDefault()
                        this.select(value)
                    }}>
                    {label}
                </button>
            </li>
        return tooltip
            ? <Tooltip msg={tooltip} below>{button}</Tooltip>
            : button
    }

    render() {
        const {options, className} = this.props
        return (
            <div className={className}>
                <ul className={styles.buttons}>
                    {options.map(({value, label, tooltip}) => this.renderButton(value, label, tooltip))}
                </ul>
            </div>
        )
    }
}

Buttons.propTypes = {
    className: PropTypes.string,
    input: PropTypes.object,
    options: PropTypes.array,
    multiple: PropTypes.any
}
