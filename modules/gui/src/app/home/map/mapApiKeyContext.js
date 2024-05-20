import React from 'react'

import {withContext} from '~/context'

const Context = React.createContext()

export const MapApiKeyContext = ({googleMapsApiKey, nicfiPlanetApiKey, children}) =>
    <Context.Provider value={{googleMapsApiKey, nicfiPlanetApiKey}}>
        {children}
    </Context.Provider>

export const withMapApiKey = withContext(Context, 'mapApiKey')
