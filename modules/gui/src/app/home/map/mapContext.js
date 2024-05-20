import React from 'react'

import {withContext} from '~/context'

const Context = React.createContext()

export const MapContext = ({map, children}) =>
    <Context.Provider value={map}>
        {children}
    </Context.Provider>

export const withMap = withContext(Context, 'map')
