import PropTypes from 'prop-types'
import React from 'react'
import flexy from './flexy.module.css'
import styles from './sectionLayout.module.css'

export const SectionLayout = ({className, children}) => {
    return (
        <div className={[flexy.container, styles.container, className].join(' ')}>
            {children}
        </div>
    )
}

SectionLayout.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const TopBar = ({padding = true, children}) => {
    return (
        <div className={[flexy.rigid, styles.bar, styles.top, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}

TopBar.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}

export const Content = ({padding = true, children}) => {
    return (
        <div className={[flexy.elastic, styles.content, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}

Content.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}

export const BottomBar = ({padding = true, children}) => {
    return (
        <div className={[flexy.rigid, styles.bar, styles.bottom, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}

BottomBar.propTypes = {
    children: PropTypes.any.isRequired,
    padding: PropTypes.any
}
