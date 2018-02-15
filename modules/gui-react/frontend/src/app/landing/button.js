import React from 'react'
import Icon from 'widget/icon'
import styles from './button.module.css'
import PropTypes from 'prop-types'

const Button = ({icon, tabIndex, onSubmit, children, ...props}) => {
    function handleClick(e) {
        e.preventDefault()
        onSubmit()
    }

    return (
        <button
            className={styles.submit}
            onClick={handleClick}
            tabIndex={tabIndex}
            {...props}
        >
            <Icon
                name={icon}
                className={styles.buttonIcon}
            />
            {children}
        </button>
    )
}
Button.propTypes = {
    icon: PropTypes.string.isRequired,
    onSubmit: PropTypes.func.isRequired,
    tabIndex: PropTypes.number
}

export default Button