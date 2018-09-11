import {IntlProvider, addLocaleData, injectIntl} from 'react-intl'
import {Provider} from 'react-redux'
import {Router} from 'react-router-dom'
import {applyMiddleware, createStore} from 'redux'
import {composeWithDevTools} from 'redux-devtools-extension'
import {initIntl} from 'translate'
import {initStore} from 'store'
import {reducer as notificationsReducer} from 'react-notification-system-redux'
import {syncHistoryAndStore} from 'route'
import App from 'app/app'
import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import createHistory from 'history/createBrowserHistory'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'

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

const batchActions = () => (next) => (action) => {
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

class IntlInitializer extends React.Component {
    constructor(props) {
        super(props)
        initIntl(props.intl)
    }

    render() {
        return this.props.children
    }
}

IntlInitializer.propTypes = {
    intl: PropTypes.object,
    children: PropTypes.any
}

const IntlInit = injectIntl(IntlInitializer)

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
