import React from 'react'
import ReactDOM from 'react-dom'
import {createLogger} from 'redux-logger'
import {composeWithDevTools} from 'redux-devtools-extension'
import {applyMiddleware, createStore} from 'redux'
import {initStore} from 'store'
import {Provider} from 'react-redux'
import {addLocaleData, injectIntl, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'
import {initIntl} from 'translate'
import {reducer as notificationsReducer} from 'react-notification-system-redux'
import App from 'app/app'
import createHistory from 'history/createBrowserHistory'
import {syncHistoryAndStore} from 'route'
import {Router} from 'react-router-dom'


// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = flat.flatten( // react-intl requires a flat object
    require(`locale/${languageWithoutRegionCode}/translations.json`)
)

const rootReducer = (state = [], action) => {
    if ('reduce' in action)
        return action.reduce(state)
    else
        return {
            ...state,
            notifications: notificationsReducer(state.notifications, action)
        }
}

const logger = createLogger({predicate: (getState, action) => !action.notLogged})

const batchActions = (store) => (next) => (action) => {
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
    composeWithDevTools(applyMiddleware(
        logger,
        batchActions
    ))
)
initStore(store)

const IntlInit = injectIntl(
    class IntlInitializer extends React.Component {
        constructor(props) {
            super(props)
            initIntl(props.intl)
        }

        render() {
            return this.props.children
        }
    }
)

const history = createHistory()
syncHistoryAndStore(history, store)

ReactDOM.render(
    <IntlProvider locale={language} messages={messages}>
        <IntlInit>
            <Provider store={store}>
                <Router history={history}>
                    <App/>
                </Router>
            </Provider>
        </IntlInit>
    </IntlProvider>,
    document.getElementById('app')
)