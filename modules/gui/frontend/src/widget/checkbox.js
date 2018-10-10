import PropTypes from 'prop-types'
import React from 'react'
import styles from './checkbox.module.css'

const Checkbox = ({label, input, tabIndex, className, onChange}) =>
    <label className={[styles.container, className].join(' ')}>
        <input
            type='checkbox'
            name={input.name}
            checked={!!input.value}
            tabIndex={tabIndex}
            onChange={e => {
                input.handleChange(e)
                input.validate()
                onChange && onChange(!!e.target.checked)
            }}
        />
        <span className={styles.checkbox}/>
        {label}
    </label>

Checkbox.propTypes = {
    input: PropTypes.object.isRequired,
    label: PropTypes.string.isRequired,
    className: PropTypes.string,
    tabIndex: PropTypes.number,
    onChange: PropTypes.func
}

export default Checkbox
