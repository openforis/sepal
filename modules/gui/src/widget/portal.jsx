import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'

import {compose} from '~/compose'
import {withContext} from '~/context'
import {withSubscriptions} from '~/subscription'

import styles from './portal.module.css'

export const DEFAULT_PORTAL_CONTAINER_ID = 'defaultPortalContainer'

const Context = React.createContext()

const withPortal = withContext(Context, 'portal')

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

class _Portal extends React.Component {
    state = {
        portalContainer: null
    }

    getPortalContainer() {
        const {type, container, portal} = this.props
        if (type === 'context') {
            const portalContainerId = portal?.id
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
        const {portalContainer} = this.state
        return portalContainer
            ? ReactDOM.createPortal(this.renderContent(), portalContainer)
            : null
    }

    componentDidMount() {
        const portalContainer = this.getPortalContainer()
        this.setState({portalContainer})
    }
}

export const Portal = compose(
    _Portal,
    withPortal(),
    withSubscriptions()
)

Portal.propTypes = {
    type: PropTypes.oneOf(['global', 'context', 'container']).isRequired,
    children: PropTypes.any,
    container: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    content: PropTypes.any
}
