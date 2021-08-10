import {withContext} from 'context'
import React from 'react'

export const TabContext = React.createContext()
export const withTabContext = withContext(TabContext, 'tabContext')
