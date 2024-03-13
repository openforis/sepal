import {withContext} from '~/context'
import React from 'react'

const Context = React.createContext()

export const MapApiKeyContext = ({googleMapsApiKey, nicfiPlanetApiKey, children}) =>
    <Context.Provider value={{googleMapsApiKey, nicfiPlanetApiKey}}>
        {children}
    </Context.Provider>

export const withMapApiKey = withContext(Context, 'mapApiKey')
