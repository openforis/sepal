import {withContext} from 'context'
import React from 'react'

const Context = React.createContext()

export const MapAreaContext = ({mapArea, children}) =>
    <Context.Provider value={mapArea}>
        {children}
    </Context.Provider>

export const withMapArea = withContext(Context, 'mapArea')
