import {Enabled} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './selectable.module.css'

export class Selectable extends React.Component {
    state = {
        active: false,
        hasBeenActive: false,
        className: null
    }

    static getDerivedStateFromProps(props, state) {
        if (state.active && !props.active) {
            return {
                active: false,
                className: props.classNames.out
            }
        }
        if (!state.active && props.active) {
            return {
                active: true,
                hasBeenActive: true,
                className: props.classNames.in
            }
        }
        return {
            active: false
        }
    }

    render() {
        const {captureMouseEvents, classNames, children} = this.props
        const {active, hasBeenActive, className} = this.state
        return hasBeenActive
            ? (
                // A selectable is not unmounted when deactivated to allow for animated transitions.
                // <Enabled/> is used to disconnect deactivated selectable from the Redux store.
                <div className={[
                    active && captureMouseEvents ? styles.captureMouseEvents : null,
                    classNames.default,
                    className
                ].join(' ')}>
                    <Enabled value={active}>
                        {children}
                    </Enabled>
                </div>
            )
            : null
    }
}

Selectable.propTypes = {
    active: PropTypes.bool,
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any,
    classNames: PropTypes.objectOf(PropTypes.string)
}
