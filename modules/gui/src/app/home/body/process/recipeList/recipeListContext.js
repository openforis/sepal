import {withContext} from 'context'
import React from 'react'

const Context = React.createContext()

export const {Provider, Consumer} = Context

export const withRecipeListContext = withContext(Context, 'recipeListContext')
