import PropTypes from 'prop-types'

import styles from './checkbox.module.css'

export const FormCheckbox = ({label, input, tabIndex, className, onChange}) => {
    const onChangeHandler = e => {
        input.handleChange(e)
        input.validate()
        onChange && onChange(!!e.target.checked)
    }
    return (
        <label className={[styles.container, className].join(' ')}>
            <input
                type='checkbox'
                name={input.name}
                checked={!!input.value}
                tabIndex={tabIndex}
                onChange={onChangeHandler}
            />
            <span className={styles.checkbox}/>
            {label}
        </label>
    )
}

FormCheckbox.propTypes = {
    input: PropTypes.object.isRequired,
    label: PropTypes.string.isRequired,
    className: PropTypes.string,
    tabIndex: PropTypes.number,
    onChange: PropTypes.func
}
