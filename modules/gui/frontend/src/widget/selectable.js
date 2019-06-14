import {Enabled} from 'store'
import {PortalContainer} from './portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './selectable.module.css'
import withContext from 'context'

const Context = React.createContext()

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
        const portalContainerId = `portal_${id}`
        return hasBeenActive
            ? (
                <Context.Provider value={{portalContainerId}}>
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
                            {this.props.children}
                            <PortalContainer id={portalContainerId}/>
                        </Enabled>
                    </div>
                </Context.Provider>
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

export const withSelectableContext = withContext(Context, 'selectableContext')
