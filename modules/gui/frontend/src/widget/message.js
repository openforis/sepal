import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './message.module.css'

export class Message extends React.Component {
    render() {
        const {className, text, type, children} = this.props
        return (
            <div className={[
                styles.text,
                styles[`type-${type}`],
                className
            ].join(' ')}>
                {this.renderIcon()}
                {children || text}
            </div>
        )
    }

    renderIcon() {
        const {icon} = this.props
        return icon
            ? (
                <Icon name={icon} size='2x' className={styles.icon}/>
            )
            : null
    }
}

Message.defaultProps = {
    type: 'normal'
}

Message.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    icon: PropTypes.string,
    text: PropTypes.string,
    type: PropTypes.oneOf(['normal', 'info'])
}
