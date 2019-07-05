import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './panelHeader.module.css'

export class PanelHeader extends React.Component {
    renderDefault() {
        const {icon, title, label} = this.props
        return (
            <React.Fragment>
                <div className={styles.title}>
                    {icon ? <Icon name={icon}/> : null}
                    {title}
                </div>
                {label ? <div className={styles.label}>{label}</div> : null}
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
    label: PropTypes.string,
    title: PropTypes.any
}
