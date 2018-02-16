import React from 'react'
import thunk from 'redux-thunk'
import {createLogger} from 'redux-logger'
import ReactDOM from 'react-dom'
import {Provider} from 'react-redux'
import {applyMiddleware, createStore} from 'redux'
import actionRegistry from 'action-registry'
import {addLocaleData, injectIntl, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'
import {initIntl} from 'translate'
import {BrowserRouter} from 'react-router-dom'
import {Route} from 'route'
import App from 'app/app'

// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = flat.flatten( // react-intl requires a flat object
    require(`locale/${languageWithoutRegionCode}/translations.json`)
)

const logger = createLogger()
const store = createStore(
    actionRegistry.rootReducer(),
    applyMiddleware(
        thunk,
        logger
    )
)

const IntlInit = injectIntl(
    class IntlInitializer extends React.Component {
        constructor(props) {
            super(props)
            console.log(props)
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
                <BrowserRouter>
                    <Route path='/' component={App}/>
                </BrowserRouter>
            </Provider>
        </IntlInit>
    </IntlProvider>,
    document.getElementById('app')
)