import App from 'app/app'
import {createBrowserHistory} from 'history'
import React from 'react'
import ReactDOM from 'react-dom'
import {Provider} from 'react-redux'
import {Router} from 'react-router-dom'
import {applyMiddleware, createStore} from 'redux'
import {syncHistoryAndStore} from 'route'
import {initStore} from 'store'
import TranslationProvider from 'translate'

const rootReducer = (state = [], action) => {
    if ('reduce' in action)
        return action.reduce(state)
    else
        return {...state}
}

const batchActions = () => next => action => {
    if ('actions' in action)
        next({
            type: action.type,
            reduce(state) {
                return action.actions.reduce(
                    (state, action) => rootReducer(state, action),
                    state
                )
            }
        })
    else
        next(action)
}

const useDevTools = middleware =>
    process.env.NODE_ENV === 'development'
        ? require('redux-devtools-extension').composeWithDevTools(middleware)
        : middleware

const store = createStore(
    rootReducer,
    useDevTools(applyMiddleware(batchActions))
)
initStore(store)

const history = createBrowserHistory()
syncHistoryAndStore(history, store)

ReactDOM.render(
    <Provider store={store}>
        <TranslationProvider>
            <Router history={history}>
                <App/>
            </Router>
        </TranslationProvider>
    </Provider>,
    document.getElementById('app')
)
