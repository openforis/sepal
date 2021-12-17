import React, {forwardRef} from 'react'

const withForwardedRef = () =>
    Component => {
        const handle = (props, ref) =>
            <Component {...props} forwardedRef={ref}/>

        const name = Component.displayName || Component.name
        handle.displayName = `withForwardedRef(${name})`

        return forwardRef(handle)
    }

export default withForwardedRef
