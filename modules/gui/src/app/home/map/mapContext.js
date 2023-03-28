import {withContext} from 'context'
import React from 'react'

const Context = React.createContext()

export const MapContext = ({map, googleMapsApiKey, nicfiPlanetApiKey, children}) =>
    <Context.Provider value={{map, googleMapsApiKey, nicfiPlanetApiKey}}>
        {children}
    </Context.Provider>

export const withMap = withContext(Context)
