import '@fontsource/merriweather'
import '@fontsource/source-sans-pro'
import '@fontsource/ubuntu'
import '@fontsource/ubuntu-mono'

import {createBrowserHistory} from 'history'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {Router} from 'react-router-dom'
import {applyMiddleware, legacy_createStore as createStore} from 'redux'

import {initApi} from '~/api'
import {App} from '~/app/app'
import {isDevelopment} from '~/environment'
import {syncHistoryAndStore} from '~/route'
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
        ? require('@redux-devtools/extension').composeWithDevTools(middleware)
        : middleware

const store = createStore(
    rootReducer,
    devTools(applyMiddleware(batchActions))
)

initStore(store)

const history = createBrowserHistory()
syncHistoryAndStore(history, store)

const container = document.getElementById('app')
const root = createRoot(container)

root.render(
    <ErrorBoundary>
        <Provider store={store}>
            <TranslationProvider>
                <Router history={history}>
                    <App/>
                </Router>
            </TranslationProvider>
        </Provider>
    </ErrorBoundary>
)
