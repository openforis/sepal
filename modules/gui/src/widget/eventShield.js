import {Portal} from './portal'
import {composeHoC} from 'compose'
import {uuid} from 'uuid'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './eventShield.module.css'

const Context = React.createContext()

export const withEventShield = () =>
    composeHoC(
        WrappedComponent =>
            class WithEventShieldHOC extends React.Component {
                componentId = uuid()

                constructor() {
                    super()
                    this.setEnabled = this.setEnabled.bind(this)
                }

                setEnabled(enabled) {
                    const {eventShield: {setEnabled}} = this.props
                    setEnabled(this.componentId, enabled)
                }

                render() {
                    const {eventShield: {enabled}} = this.props
                    return React.createElement(WrappedComponent, {
                        ...this.props,
                        eventShield: {enabled, setEnabled: this.setEnabled}
                    })
                }

                componentWillUnmount() {
                    this.setEnabled(false)
                }
            },
        withContext(Context, 'eventShield')()
    )

export class EventShield extends React.Component {
    constructor(props) {
        super(props)
        this.setEnabled = this.setEnabled.bind(this)
    }

    state = {
        enabledIds: []
    }
    
    setEnabled(id, enabled) {
        if (enabled) {
            this.setState(({enabledIds}) => {
                const index = enabledIds.indexOf(id)
                if (index === -1) {
                    return {enabledIds: [...enabledIds, id]}
                }
            })
        } else {
            this.setState(({enabledIds}) => {
                const index = enabledIds.indexOf(id)
                if (index !== -1) {
                    return {enabledIds: enabledIds.toSpliced(index, 1)}
                }
            })
        }
    }
    
    render() {
        const {children} = this.props
        const {enabledIds} = this.state
        const enabled = enabledIds.length
        return (
            <Context.Provider value={{enabled, setEnabled: this.setEnabled}}>
                {children}
                {enabled ? this.renderEventShield() : null}
            </Context.Provider>
        )
    }

    renderEventShield() {
        return (
            <Portal type='global'>
                <div className={styles.overlay}/>
            </Portal>
        )
    }
}

EventShield.propTypes = {
    children: PropTypes.any,
    enabled: PropTypes.any
}
