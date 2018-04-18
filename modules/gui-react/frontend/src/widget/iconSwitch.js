import React from 'react'
import Icon from 'widget/icon'
import styles from './iconSwitch.module.css'
import PropTypes from 'prop-types'

export default class IconSwitch extends React.Component {
    toggle() {
        this.props.onChange(!this.props.on)
    }

    render() {
        const {className, on, icon, onClassName, offClassName} = this.props
        const classNames = [styles.iconSwitch, className, on ? onClassName : offClassName].join(' ')
        return (
            <div className={classNames} onClick={this.toggle.bind(this)}>
                <Icon name={icon}/>
            </div>
        )
    }
}

IconSwitch.propTypes = {
    className: PropTypes.string,
    on: PropTypes.bool,
    icon: PropTypes.string,
    onClassName: PropTypes.string,
    offClassName: PropTypes.string,
    onChange: PropTypes.func
}
