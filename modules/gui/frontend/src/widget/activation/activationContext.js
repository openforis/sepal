import * as PropTypes from 'prop-types'
import React, {Component} from 'react'
import actionBuilder from 'action-builder'

const Context = React.createContext()

export class ActivationContext extends Component {
    pathList() {
        const {id} = this.props
        const parentPathList = (this.context && this.context.pathList) || ['activation']
        return [...parentPathList, 'contexts', id]
    }

    render() {
        const {children} = this.props
        const pathList = this.pathList()
        return (
            <Context.Provider value={{pathList}}>
                {children}
            </Context.Provider>
        )
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

export const withActivationContext = () => {
    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Context.Consumer>
                        {activationContext => {
                            if (!activationContext)
                                throw new Error(`Component has no ActivationContext: ${WrappedComponent}`)
                            return React.createElement(WrappedComponent, {
                                ...this.props,
                                activationContext
                            })
                        }}
                    </Context.Consumer>
                )
            }
        }

        return HigherOrderComponent
    }
}
