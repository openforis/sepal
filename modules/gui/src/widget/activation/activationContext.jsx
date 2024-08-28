import PropTypes from 'prop-types'
import React, {Component} from 'react'

import {actionBuilder} from '~/action-builder'
import {withContext} from '~/context'

const Context = React.createContext()

export const withActivationContext = withContext(Context, 'activationContext', true)

export class ActivationContext extends Component {
    render() {
        const {children} = this.props
        const pathList = this.pathList()
        return (
            <Context.Provider value={{pathList}}>
                {children}
            </Context.Provider>
        )
    }

    pathList() {
        const {id} = this.props
        const parentPathList = this.context?.pathList || ['activation']
        return [...parentPathList, 'contexts', id]
    }

    componentDidMount() {
        const pathList = this.pathList()
        actionBuilder('CREATE_ACTIVATION_CONTEXT', {pathList})
            .set(pathList, {})
            .dispatch()
    }

    componentWillUnmount() {
        const pathList = this.pathList()
        actionBuilder('REMOVE_ACTIVATION_CONTEXT', {pathList})
            .del(pathList)
            .dispatch()
    }
}

ActivationContext.contextType = Context

ActivationContext.propTypes = {
    id: PropTypes.string.isRequired,
    children: PropTypes.any
}
