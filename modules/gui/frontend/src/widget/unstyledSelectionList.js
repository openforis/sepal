import {Button} from 'widget/button'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'

export default class UnstyledSelectionList extends React.Component {
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
        const button =
            <li key={value}>
                <Button
                    look={alwaysSelected || (!neverSelected && this.isSelected(value)) ? 'highlight' : 'default'}
                    disabled={disabled || alwaysSelected || neverSelected}
                    onClick={e => {
                        e.preventDefault()
                        this.select(value)
                    }}>
                    {label}
                </Button>
            </li>
        return tooltip && !(disabled || alwaysSelected || neverSelected)
            ? <Tooltip
                key={value}
                msg={tooltip}
                placement='bottom'>{button}</Tooltip>
            : button
    }

    renderButtons(options) {
        const {styles} = this.props
        return (
            <ul className={styles.buttons}>
                {options.map(option =>
                    this.renderButton(option))}
            </ul>
        )
    }

    renderOptionGroups(groups) {
        const {styles} = this.props
        return (
            groups.map((group, i) =>
                <div key={group.value || group.label || i} className={styles.group}>
                    {this.renderButtons(group.options)}
                </div>
            )
        )
    }

    render() {
        const {options, className} = this.props
        return (
            <div className={className}>
                {options.length && options[0].options
                    ? this.renderOptionGroups(options)
                    : this.renderButtons(options)}
            </div>
        )
    }
}

UnstyledSelectionList.propTypes = {
    styles: PropTypes.object.isRequired,
    className: PropTypes.string,
    input: PropTypes.object,
    multiple: PropTypes.any,
    options: PropTypes.array,
    onChange: PropTypes.any
}
