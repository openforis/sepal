import {withContext} from 'context'
import React from 'react'

export const MapContext = React.createContext()

export const withMap = withContext(MapContext)
export const withMapContext = withContext(MapContext, 'mapContext')
