import {withContext} from 'context'
import React from 'react'

export const MapAreaContext = React.createContext()

export const withMapAreaContext = withContext(MapAreaContext, 'mapAreaContext')
