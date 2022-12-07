import {Enabled} from 'store'
import {PortalContainer, PortalContext} from 'widget/portal'
import {StaticMap} from '../map/staticMap'
import {isPathInLocation} from 'route'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './section.module.css'

export class Section extends React.Component {
    state = {
        initialized: false,
        active: false
    }

    static getDerivedStateFromProps(props, state) {
        const active = isPathInLocation(props.path)
        // lazy-initialize sections at first activation
        const initialized = state.initialized || active
        return {active, initialized}
    }

    render() {
        const {initialized} = this.state
        return initialized
            ? this.renderInitialized()
            : null
    }

    renderInitialized() {
        const {staticMap} = this.props
        const {active} = this.state
        return (
            <div className={[
                styles.section,
                active ? styles.active : null,
                active && staticMap ? styles.staticMap : null,
            ].join(' ')}>
                {this.renderEnabled()}
            </div>
        )
    }

    renderEnabled() {
        const {path} = this.props
        const {active} = this.state
        const portalContainerId = `portal_selectable_${path}`
        return (
            <Enabled
                value={active}
                enabledClassName={styles.enabled}
                disabledClassName={styles.disabled}>
                <PortalContext id={portalContainerId}>
                    <PortalContainer id={portalContainerId} className={styles.portalContainer}/>
                    {this.renderContent()}
                </PortalContext>
            </Enabled>
        )
    }

    renderContent() {
        const {staticMap, children} = this.props
        return staticMap
            ? <StaticMap>{children}</StaticMap>
            : children
    }
}

Section.propTypes = {
    children: PropTypes.any,
    path: PropTypes.string,
    staticMap: PropTypes.any
}
