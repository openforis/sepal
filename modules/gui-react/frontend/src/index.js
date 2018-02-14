import React from 'react'
import thunk from 'redux-thunk'
import {createLogger} from 'redux-logger'
import ReactDOM from 'react-dom'
import App from './app/app'
import {Provider} from 'react-redux'
import {applyMiddleware, createStore} from 'redux'
import actionRegistry from 'action-registry'
import {addLocaleData, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'

// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = require(`locale/${languageWithoutRegionCode}/translations.json`)

const logger = createLogger()
const store = createStore(
    actionRegistry.rootReducer(),
    applyMiddleware(
        thunk,
        logger
    )
)

ReactDOM.render(
    <IntlProvider locale={language} messages={messages}>
        <Provider store={store}>
            <App/>
        </Provider>
    </IntlProvider>,
    document.getElementById('app')
)