import {compose} from 'compose'
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

class Portal extends React.Component {
    getPortalContainer() {
        const {type, container, selectableContext} = this.props
        if (type === 'container' && container) {
            return container
        }
        if (type === 'section') {
            const portalContainerId = selectableContext ? selectableContext.portalContainerId : null
            if (portalContainerId) {
                return document.getElementById(portalContainerId)
            } else {
                throw Error('Cannot render section Portal out of a section.')
            }
        }
        if (type === 'global') {
            return document.getElementById(DEFAULT_PORTAL_CONTAINER_ID)
        }
        throw Error('Undefined Portal target.')
    }
    
    renderContent() {
        const {content, children} = this.props
        return content || children
    }

    render() {
        return (
            ReactDOM.createPortal(
                this.renderContent(),
                this.getPortalContainer()
            )
        )
    }
}

Portal.propTypes = {
    type: PropTypes.oneOf(['global', 'section', 'container']).isRequired,
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    content: PropTypes.any
}

export default compose(
    Portal,
    withSelectableContext()
)
