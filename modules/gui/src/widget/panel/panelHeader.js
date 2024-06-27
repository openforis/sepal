import PropTypes from 'prop-types'
import React from 'react'

import {Icon} from '~/widget/icon'

import styles from './panelHeader.module.css'

export class PanelHeader extends React.Component {
    renderIcon() {
        const {icon} = this.props
        return icon
            ? (
                <div className={styles.icon}>
                    <Icon name={icon}/>
                </div>
            )
            : null
    }

    renderTitle() {
        const {title} = this.props
        return (
            <div className={styles.title}>
                {title}
            </div>
        )
    }

    renderLabel() {
        const {label} = this.props
        return label
            ? (
                <div className={styles.label}>
                    {label}
                </div>)
            : null
    }

    renderDefault() {
        return (
            <React.Fragment>
                {this.renderIcon()}
                {this.renderTitle()}
                {this.renderLabel()}
            </React.Fragment>
        )
    }

    render() {
        const {className, children} = this.props
        return (
            <div className={[styles.header, className].join(' ')}>
                {children ? children : this.renderDefault()}
            </div>
        )
    }
}

PanelHeader.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    icon: PropTypes.string,
    label: PropTypes.any,
    title: PropTypes.any
}
