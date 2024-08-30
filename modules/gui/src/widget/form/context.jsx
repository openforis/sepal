import React from 'react'

import {withContext} from '~/context'

const Context = React.createContext()

export const FormContext = ({form, children}) =>
    <Context.Provider value={form}>
        {children}
    </Context.Provider>

export const withFormContext = withContext(Context, 'form')
