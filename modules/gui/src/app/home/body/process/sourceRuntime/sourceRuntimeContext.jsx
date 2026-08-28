import React from 'react'
import {useStore} from 'react-redux'

import {withContext} from '~/context'

import {createReduxSourceEnvironment} from './reduxSourceEnvironment'
import {createSourceRuntime} from './sourceRuntime'

// One source runtime per Process instance, wrapping Process inside its retained Section rather than a recipe,
// panel, tab or map layer. Section keeps Process mounted once activated, so a detached Retrieve preflight
// survives panel closure and route navigation. Scoped no wider than that: Browse, Terminal and Tasks have no
// source-resolution concern, and Process teardown is what should end the runtime.
//
// The context value is created once and never replaced, so a catalogue change cannot rerender a consumer. The
// store comes from React Redux rather than the singleton helpers in `store.js`, so the runtime is bound to an
// injected store and stays isolatable.

const Context = React.createContext()

export const SourceRuntimeProvider = ({children}) => {
    const store = useStore()
    const [runtime] = React.useState(() => {
        const environment = createReduxSourceEnvironment({store})
        return {
            sourceRuntime: createSourceRuntime({environment$: environment.environment$}),
            close: environment.close
        }
    })

    // Unmounting ends the scope that owned the runtime. Detached operations are told so, rather than left
    // running against an environment that no longer exists.
    React.useEffect(() => () => runtime.close(), [runtime])

    return (
        <Context.Provider value={runtime.sourceRuntime}>
            {children}
        </Context.Provider>
    )
}

export const useSourceRuntime = () => React.useContext(Context)

// Recipe code is overwhelmingly class components composed with compose(), so the runtime has to be reachable
// that way too - otherwise the first consumer writes its own wrapper.
export const withSourceRuntime = withContext(Context, 'sourceRuntime')
