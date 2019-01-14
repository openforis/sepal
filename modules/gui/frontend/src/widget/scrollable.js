import React from 'react'
import styles from './scrollable.module.css'

export const ScrollableContainer = ({className, children}) => {
    return (
        <div className={[className, styles.container].join(' ')}>
            {children}
        </div>
    )
}

export const Unscrollable = ({className, children}) => {
    return (
        <div className={[className, styles.unscrollable].join(' ')}>
            {children}
        </div>
    )
}

export const Scrollable = ({className, children}) => {
    return (
        <div className={[className, styles.scrollable].join(' ')}>
            {children}
        </div>
    )
}
