import {composeHoC} from 'compose'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import {BehaviorSubject} from 'rxjs'

import {uuid} from '~/uuid'

import styles from './eventShield.module.css'
import {Portal} from './portal'

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

                render() {
                    const {eventShield: {enabled$}} = this.props
                    return React.createElement(WrappedComponent, {
                        ...this.props,
                        eventShield: {enabled$, setEnabled: this.setEnabled}
                    })
                }

                setEnabled(enabled) {
                    const {eventShield: {setEnabled}} = this.props
                    setEnabled(this.componentId, enabled)
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

    enabled$ = new BehaviorSubject(false)

    state = {
        enabledIds: []
    }
    
    setEnabled(id, enabled) {
        this.setState(({enabledIds}) => {
            const index = enabledIds.indexOf(id)
            if (enabled && index === -1) {
                return {enabledIds: [...enabledIds, id]}
            }
            if (!enabled && index !== -1) {
                return {enabledIds: enabledIds.toSpliced(index, 1)}
            }
        }, () => this.update())
    }

    update() {
        this.enabled$.next(this.isEnabled())
    }

    isEnabled() {
        const {enabledIds} = this.state
        return enabledIds.length > 0
    }
    
    render() {
        const {children} = this.props
        const {enabled$, setEnabled} = this
        return (
            <Context.Provider value={{enabled$, setEnabled}}>
                {children}
                {this.isEnabled() ? this.renderEventShield() : null}
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
