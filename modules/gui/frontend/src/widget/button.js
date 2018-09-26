import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './button.module.css'

export const Button = ({icon, iconType, tabIndex, onClick, className, children, ...props}) => {
    function handleClick(e) {
        if (onClick) {
            e.preventDefault()
            onClick(e)
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
                <Icon name={icon} type={iconType}/>
                {children}
            </div>
        </button>
    )
}

Button.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    icon: PropTypes.string,
    iconType: PropTypes.string,
    tabIndex: PropTypes.number,
    onClick: PropTypes.func
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

export const IconButton = ({icon, iconType, tabIndex, onClick, className, ...props}) =>
    <Button
        icon={icon}
        iconType={iconType}
        tabIndex={tabIndex}
        onClick={onClick}
        className={`${styles.icon} ${className}`}
        {...props}/>

IconButton.propTypes = Button.propTypes
