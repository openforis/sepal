import {withContext} from 'context'
import React from 'react'

const MapContext = React.createContext()

export const {Provider, Consumer} = MapContext

export const withMapContext = withContext(MapContext)
