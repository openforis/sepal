import React from 'react'
import withContext from 'context'

export const FormContext = React.createContext()

export const withFormContext = withContext(FormContext, 'form')
