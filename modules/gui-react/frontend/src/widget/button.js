import React from 'react'
import Icon from 'widget/icon'
import styles from './button.module.css'
import PropTypes from 'prop-types'

export const Button = ({icon, tabIndex, onClick, className, children, ...props}) => {
    function handleClick(e) {
        if (onClick) {
            e.preventDefault()
            onClick()
        }
    }

    return (
        <button
            className={`${styles.default} ${className}`}
            onClick={handleClick}
            tabIndex={tabIndex}
            {...props}
        >
            <div className={styles.content}>
                <Icon name={icon}/>
                {children}
            </div>
        </button>
    )
}

Button.propTypes = {
    icon: PropTypes.string,
    onClick: PropTypes.func,
    tabIndex: PropTypes.number,
    className: PropTypes.string
}

export const SubmitButton = ({icon, tabIndex, onClick, className, children, ...props}) =>
    <Button
        icon={icon}
        tabIndex={tabIndex}
        onClick={onClick}
        className={`${styles.submit} ${className}`}
        {...props}>
        {children}
    </Button>

SubmitButton.propTypes = Button.propTypes

export const IconButton = ({icon, tabIndex, onClick, className, children, ...props}) =>
    <Button
        icon={icon}
        tabIndex={tabIndex}
        onClick={onClick}
        className={`${styles.icon} ${className}`}
        {...props}/>

IconButton.propTypes = Button.propTypes
