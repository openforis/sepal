import {withContext} from 'context'
import React from 'react'

export const FormContext = React.createContext()

export const withFormContext = withContext(FormContext, 'form')
