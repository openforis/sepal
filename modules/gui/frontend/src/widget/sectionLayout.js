import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sectionLayout.module.css'

export const SectionLayout = ({className, children}) => {
    return (
        <ScrollableContainer className={className}>
            {children}
        </ScrollableContainer>
    )
}

SectionLayout.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const TopBar = ({padding = true, children}) => {
    return (
        <Unscrollable className={[styles.bar, styles.top, padding ? styles.padding : null].join(' ')}>
            {children}
        </Unscrollable>
    )
}

TopBar.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}

export const Content = ({padding = true, children}) => {
    return (
        <Scrollable className={[styles.content, padding ? styles.padding : null].join(' ')}>
            {children}
        </Scrollable>
    )
}

Content.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}

export const BottomBar = ({padding = true, children}) => {
    return (
        <Unscrollable className={[styles.bar, styles.bottom, padding ? styles.padding : null].join(' ')}>
            {children}
        </Unscrollable>
    )
}

BottomBar.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}
