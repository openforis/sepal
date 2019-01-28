import {Provider} from 'react-redux'
import {Router} from 'react-router-dom'
import {applyMiddleware, createStore} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'
import {initStore} from 'store'
import {syncHistoryAndStore} from 'route'
import App from 'app/app'
import React from 'react'
import ReactDOM from 'react-dom'
import TranslationProvider from 'translate'
import createHistory from 'history/createBrowserHistory'

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

const store = createStore(
    rootReducer,
    composeWithDevTools(applyMiddleware(batchActions))
)
initStore(store)

const history = createHistory()
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
