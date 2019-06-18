import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import styles from './portal.module.css'
import withContext from 'context'

const DEFAULT_PORTAL_CONTAINER_ID = 'defaultPortalContainer'

const Context = React.createContext()

export class PortalContext extends React.Component {
    render() {
        const {id, children} = this.props
        return (
            <Context.Provider value={{id}}>
                {children}
            </Context.Provider>
        )
    }
}

export const withPortalContext = withContext(Context, 'portalContext')

export const PortalContainer = ({id, className}) => (
    <div
        id={id || DEFAULT_PORTAL_CONTAINER_ID}
        className={[styles.portalContainer, className].join(' ')}
    />
)

PortalContainer.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
}

class Portal extends React.Component {
    getPortalContainer() {
        const {type, container, portalContext} = this.props
        if (type === 'context') {
            const portalContainerId = portalContext ? portalContext.id : null
            if (portalContainerId) {
                return document.getElementById(portalContainerId)
            } else {
                throw Error('Cannot render section Portal out of a section.')
            }
        }
        if (type === 'container' && container) {
            return container
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
        const portalContainer = this.getPortalContainer()
        return portalContainer
            ? ReactDOM.createPortal(
                this.renderContent(),
                portalContainer
            )
            : null
    }
}

Portal.defaultProps = {
    type: 'context'
}

Portal.propTypes = {
    type: PropTypes.oneOf(['global', 'context', 'container']).isRequired,
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    content: PropTypes.any
}

export default compose(
    Portal,
    withPortalContext()
)
