import React from 'react'

import {withContext} from '~/context'

const Context = React.createContext()

export const MapAreaContext = ({mapArea, children}) =>
    <Context.Provider value={mapArea}>
        {children}
    </Context.Provider>

export const withMapArea = withContext(Context, 'mapArea')
