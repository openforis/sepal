import PropTypes from 'prop-types'
import React from 'react'
import flexy from './flexy.module.css'
import styles from './sectionLayout.module.css'

export const SectionLayout = ({className, children}) => {
    return (
        <div className={[flexy.container, className].join(' ')}>
            {children}
        </div>
    )
}

SectionLayout.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const TopBar = ({className, label, children}) => {
    return (
        <div className={[className, flexy.rigid, styles.bar, styles.top].join(' ')}>
            {label ? <div className={styles.label}>{label}</div> : null}
            {children}
        </div>
    )
}

TopBar.propTypes = {
    children: PropTypes.any,
    padding: PropTypes.any
}

export const Content = ({menuPadding, appMenuPadding, horizontalPadding, verticalPadding, className, children}) => {
    return (
        <div className={[
            flexy.elastic,
            styles.content,
            horizontalPadding ? styles.horizontalPadding : null,
            verticalPadding ? styles.verticalPadding : null,
            menuPadding ? styles.menuPadding : null,
            appMenuPadding ? styles.appMenuPadding : null,
            className
        ].join(' ')}>
            {children}
        </div>
    )
}

Content.propTypes = {
    children: PropTypes.any.isRequired,
    appMenuPadding: PropTypes.any,
    horizontalPadding: PropTypes.any,
    menuPadding: PropTypes.any,
    padding: PropTypes.any,
    verticalPadding: PropTypes.any,
}

export const ContentPadding = ({menuPadding, appMenuPadding, horizontalPadding, verticalPadding, className, children}) => {
    return (
        <div className={[
            styles.content,
            horizontalPadding ? styles.horizontalPadding : null,
            verticalPadding ? styles.verticalPadding : null,
            menuPadding ? styles.menuPadding : null,
            appMenuPadding ? styles.appMenuPadding : null,
            className
        ].join(' ')}>
            {children}
        </div>
    )
}

ContentPadding.propTypes = {
    children: PropTypes.any.isRequired,
    appMenuPadding: PropTypes.any,
    horizontalPadding: PropTypes.any,
    menuPadding: PropTypes.any,
    padding: PropTypes.any,
    verticalPadding: PropTypes.any,
}

export const BottomBar = ({padding = true, className, children}) => {
    return (
        <div className={[className, flexy.rigid, styles.bar, styles.bottom, padding ? styles.padding : null].join(' ')}>
            {children}
        </div>
    )
}

BottomBar.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    padding: PropTypes.any
}
