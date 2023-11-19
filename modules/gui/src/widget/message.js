import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './message.module.css'

export class Message extends React.Component {
    render() {
        const {className, text, type, centered, children} = this.props
        return (
            <div className={[
                styles.message,
                styles[`type-${type}`],
                centered ? styles.centered : null,
                className
            ].join(' ')}>
                {this.renderIcon()}
                <div>{children || text}</div>
            </div>
        )
    }

    renderIcon() {
        const {icon, iconSize} = this.props
        return icon
            ? (
                <Icon name={icon} size={iconSize} className={styles.icon}/>
            )
            : null
    }
}

Message.defaultProps = {
    type: 'normal'
}

Message.propTypes = {
    centered: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
    icon: PropTypes.string,
    iconSize: PropTypes.string,
    text: PropTypes.string,
    type: PropTypes.oneOf(['normal', 'info', 'warning'])
}
