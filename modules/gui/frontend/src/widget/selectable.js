import {Enabled} from 'store'
import {PortalContainer, PortalContext} from './portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './selectable.module.css'

export class Selectable extends React.Component {
    state = {
        hasBeenActive: false
    }

    static getDerivedStateFromProps(props, state) {
        return {
            ...state,
            hasBeenActive: state.hasBeenActive || props.active
        }
    }

    render() {
        const {id, active, className, captureMouseEvents} = this.props
        const {hasBeenActive} = this.state
        const portalContainerId = `portal_selectable_${id}`
        return hasBeenActive
            ? (
                <PortalContext id={portalContainerId}>
                    <div className={[
                        styles.container,
                        active ? styles.active : styles.inactive,
                        active && captureMouseEvents ? styles.captureMouseEvents : null,
                        className
                    ].join(' ')}>
                        <Enabled
                            value={active}
                            enabledClassName={styles.enabled}
                            disabledClassName={styles.disabled}>
                            <PortalContainer id={portalContainerId} className={styles.portalContainer}/>
                            {this.props.children}
                        </Enabled>
                    </div>
                </PortalContext>
            )
            : null
    }
}

Selectable.propTypes = {
    active: PropTypes.bool.isRequired,
    captureMouseEvents: PropTypes.any,
    children: PropTypes.any,
    className: PropTypes.string,
    id: PropTypes.string
}
