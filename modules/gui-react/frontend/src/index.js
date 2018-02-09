import React from 'react'
import thunk from 'redux-thunk'
import {createLogger} from 'redux-logger'
import ReactDOM from 'react-dom'
import App from './app/app'
import {Provider} from 'react-redux'
import {applyMiddleware, createStore} from 'redux'
import actionRegistry from 'action-registry'

const loggerMiddleware = createLogger()

const store = createStore(
    actionRegistry.rootReducer(),
    applyMiddleware(
        thunk,
        loggerMiddleware
    )
)

ReactDOM.render(
    <Provider store={store}>
        <App/>
    </Provider>,
    document.getElementById('app')
)