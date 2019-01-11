import React from 'react'
import styles from './sectionLayout.module.css'

export const SectionLayout = ({className, children}) => {
    return (
        <div className={[styles.sectionLayout, className].join(' ')}>
            {children}
        </div>
    )
}

export const TopBar = ({padding = true, children}) => {
    return (
        <div className={[styles.bar, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}

export const Content = ({children}) => {
    return (
        <div className={styles.content}>
            {children}
        </div>
    )
}

export const BottomBar = ({padding = true, children}) => {
    return (
        <div className={[styles.bar, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}
