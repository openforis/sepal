import React from 'react'

export const withProps = callback =>
    WrappedComponent =>
        ({children, ...props}) => {
            const callbackProps = callback()
            return React.createElement(WrappedComponent, {
                ...props,
                ...callbackProps
            }, children)
        }
