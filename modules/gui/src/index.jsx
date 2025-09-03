import '@fontsource/ubuntu/300.css'
import '@fontsource/ubuntu/400.css'
import '@fontsource/ubuntu/500.css'
import '@fontsource/source-sans-pro/300.css'
import '@fontsource/source-sans-pro/400.css'
import '@fontsource/source-sans-pro/600.css'
import '@fontsource/source-sans-pro/700.css'

import {composeWithDevTools} from '@redux-devtools/extension'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {BrowserRouter} from 'react-router'
import {applyMiddleware, legacy_createStore as createStore} from 'redux'

import {initApi} from '~/api'
import {App} from '~/app/app'
import {isDevelopment} from '~/environment'
import {initStore} from '~/store'
import {TranslationProvider} from '~/translate'

import {ErrorBoundary} from './errorBoundary'

initApi()

const rootReducer = (state = [], action) => {
    if ('reduce' in action)
        return action.reduce(state)
    else
        return {...state}
}

const batchActions = () => next => action => {
    if ('actions' in action) {
        next({
            type: action.type,
            reduce(state) {
                return action.actions.reduce(
                    (state, action) => rootReducer(state, action),
                    state
                )
            }
        })
    } else {
        next(action)
    }
}

const devTools = middleware =>
    isDevelopment()
        ? composeWithDevTools(middleware)
        : middleware

const store = createStore(
    rootReducer,
    devTools(applyMiddleware(batchActions))
)

initStore(store)

const container = document.getElementById('app')
const root = createRoot(container)

root.render(
    <ErrorBoundary>
        <Provider store={store}>
            <TranslationProvider>
                <BrowserRouter>
                    <App/>
                </BrowserRouter>
            </TranslationProvider>
        </Provider>
    </ErrorBoundary>
)
