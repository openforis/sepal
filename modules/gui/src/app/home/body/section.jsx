import {useEffect, useState} from 'react'
import {useLocation} from 'react-router'

import {Enabled} from '~/enabled'
import {isPathInLocation} from '~/route'
import {PortalContainer, PortalContext} from '~/widget/portal'

import styles from './section.module.css'

export const Section = ({path, children}) => {
    const location = useLocation()
    const [initialized, setInitialized] = useState(false)
    const [enabled, setEnabled] = useState(false)
    const portalContainerId = `portal_selectable_${path}`

    useEffect(() => {
        setEnabled(isPathInLocation(path, location.pathname))
    }, [path, location])

    useEffect(() => {
        setInitialized(initialized || enabled)
    }, [initialized, enabled])

    const renderEnabled = () => (
        <Enabled
            enabled={enabled}
            enabledClassName={styles.enabled}
            disabledClassName={styles.disabled}>
            <PortalContext id={portalContainerId}>
                <PortalContainer id={portalContainerId} className={styles.portalContainer}/>
                {children}
            </PortalContext>
        </Enabled>
    )

    const renderInitialized = () => (
        <div className={[
            styles.section,
            enabled ? styles.active : null,
        ].join(' ')}>
            {renderEnabled()}
        </div>
    )

    return initialized
        ? renderInitialized()
        : null
}
