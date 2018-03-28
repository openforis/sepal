import React from 'react'
import Icon from 'widget/icon'
import styles from './flipSwitch.module.css'
import PropTypes from 'prop-types'

class FlipSwitch extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            on: props.on
        }
    }

    toggle() {
        const nextState = !this.state.on
        this.props.onChange(nextState)
        this.setState({on: nextState})
    }

    render() {
        const {offIcon, onIcon} = this.props
        return (
            <div className={[styles.flipSwitch, this.state.on ? styles.active : ''].join(' ')} onClick={this.toggle.bind(this)}>
                <Icon name={offIcon} className={[styles.icon, styles.offIcon].join(' ')}/>
                <Icon name={onIcon} className={[styles.icon, styles.onIcon].join(' ')}/>
                <div className={styles.slider}></div>
            </div>
        )
    }
}

FlipSwitch.propTypes = {
    on: PropTypes.bool,
    offIcon: PropTypes.string,
    onIcon: PropTypes.string,
    onChange: PropTypes.func
}

export default FlipSwitch