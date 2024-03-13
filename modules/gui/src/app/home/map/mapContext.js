import {withContext} from '~/context'
import React from 'react'

const Context = React.createContext()

export const MapContext = ({map, children}) =>
    <Context.Provider value={map}>
        {children}
    </Context.Provider>

export const withMap = withContext(Context, 'map')
