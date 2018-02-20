import React from 'react'
import ReactDOM from 'react-dom'
import thunk from 'redux-thunk'
import {createLogger} from 'redux-logger'
import {applyMiddleware, combineReducers, createStore} from 'redux'
import {Provider} from 'react-redux'
import {Route} from 'route'
import {ConnectedRouter, routerMiddleware, routerReducer} from 'react-router-redux'
import createHistory from 'history/createBrowserHistory'
import {addLocaleData, injectIntl, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'
import {initIntl} from 'translate'
import App from 'app/app'
import actionRegistry from 'action-registry'

const history = createHistory()

// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = flat.flatten( // react-intl requires a flat object
    require(`locale/${languageWithoutRegionCode}/translations.json`)
)

const store = createStore(
    combineReducers({
        app: actionRegistry.rootReducer(),
        router: routerReducer
    }),
    applyMiddleware(
        routerMiddleware(history),
        thunk,
        createLogger()
    )
)

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

ReactDOM.render(
    <IntlProvider locale={language} messages={messages}>
        <IntlInit>
            <Provider store={store}>
                <ConnectedRouter history={history}>
                    <Route path='/' component={App}/>
                </ConnectedRouter>
            </Provider>
        </IntlInit>
    </IntlProvider>,
    document.getElementById('app')
)