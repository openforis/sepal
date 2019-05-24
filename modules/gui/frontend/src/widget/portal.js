import {withSelectableContext} from './selectable'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import styles from './portal.module.css'

const DEFAULT_PORTAL_CONTAINER_ID = 'defaultPortalContainer'

export const PortalContainer = ({id}) => (
    <div
        id={id || DEFAULT_PORTAL_CONTAINER_ID}
        className={[
            styles.portalContainer,
            id ? styles.section : styles.fullScreen
        ].join(' ')}
    />
)

const Portal = ({container, containerId, content, children, selectableContext}) => {
    const selectableContainerId = selectableContext ? selectableContext.id : null
    if (container && containerId) {
        throw new Error('Portal can be passed either a container or a containerId, not both.')
    }
    return ReactDOM.createPortal(
        content || children,
        container || document.getElementById(containerId || selectableContainerId || DEFAULT_PORTAL_CONTAINER_ID)
    )
}

Portal.propTypes = {
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    containerId: PropTypes.string,
    content: PropTypes.any
}

export default withSelectableContext()(Portal)
