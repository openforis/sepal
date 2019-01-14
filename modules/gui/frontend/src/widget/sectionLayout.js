import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import React from 'react'
import styles from './sectionLayout.module.css'

export const SectionLayout = ({className, children}) => {
    return (
        <ScrollableContainer className={className}>
            {children}
        </ScrollableContainer>
    )
}

export const TopBar = ({padding = true, children}) => {
    return (
        <Unscrollable className={[styles.bar, styles.top, padding ? styles.padding : null].join(' ')}>
            {children}
        </Unscrollable>
    )
}

export const Content = ({children}) => {
    return (
        <Scrollable className={styles.content}>
            {children}
        </Scrollable>
    )
}

export const BottomBar = ({padding = true, children}) => {
    return (
        <Unscrollable className={[styles.bar, styles.bottom, padding ? styles.padding : null].join(' ')}>
            {children}
        </Unscrollable>
    )
}
