import React from 'react'

const Context = React.createContext()

export const ActivationContext = ({statePath, children}) =>
    <Context.Provider value={{statePath}}>
        {children}
    </Context.Provider>

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
