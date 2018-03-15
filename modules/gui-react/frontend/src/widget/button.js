import React from 'react'
import Icon from 'widget/icon'
import styles from './button.module.css'
import PropTypes from 'prop-types'

export const Button = ({icon, tabIndex, onClick, classNames, children, ...props}) => {
    function handleClick(e) {
        e.preventDefault()
        onClick && onClick()
    }

    return (
        <button
            className={`${styles.default} ${classNames}`}
            onClick={handleClick}
            tabIndex={tabIndex}
            {...props}
        >
            <span className={styles.buttonIcon}>
                <Icon name={icon}/>
            </span>
            {children}
        </button>
    )
}

Button.propTypes = {
    icon: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    tabIndex: PropTypes.number,
    classNames: PropTypes.string
}

export const SubmitButton = ({icon, tabIndex, onClick, classNames, children, ...props}) =>
    <Button
        icon={icon}
        tabIndex={tabIndex}
        onClick={onClick}
        classNames={`${styles.submit} ${classNames}`}
        {...props}>
        {children}
    </Button>

SubmitButton.propTypes = Button.propTypes

export const IconButton = ({icon, tabIndex, onClick, classNames, children, ...props}) =>
    <Button
        icon={icon}
        tabIndex={tabIndex}
        onClick={onClick}
        classNames={`${styles.icon} ${classNames}`}
        {...props}>&nbsp;</Button>

IconButton.propTypes = Button.propTypes
