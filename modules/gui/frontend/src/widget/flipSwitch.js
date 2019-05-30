import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './flipSwitch.module.css'

export default class FlipSwitch extends React.Component {
    toggle() {
        this.props.onChange(!this.props.on)
    }

    render() {
        const {on, offIcon, onIcon} = this.props
        return (
            <div className={[styles.flipSwitch, on ? styles.active : ''].join(' ')}
                onClick={this.toggle.bind(this)}>
                <Icon name={offIcon} className={[styles.icon, styles.offIcon].join(' ')}/>
                <Icon name={onIcon} className={[styles.icon, styles.onIcon].join(' ')}/>
                <div className={styles.slider}></div>
            </div>
        )
    }
}

FlipSwitch.propTypes = {
    offIcon: PropTypes.string,
    on: PropTypes.bool,
    onChange: PropTypes.func,
    onIcon: PropTypes.string
}
