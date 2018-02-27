import React from 'react'
import ReactDOM from 'react-dom'
import {EventPublishingRouter, Route} from 'route'
import createHistory from 'history/createBrowserHistory'
import {addLocaleData, injectIntl, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'
import {initIntl} from 'translate'
import App from 'app/app'

// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = flat.flatten( // react-intl requires a flat object
    require(`locale/${languageWithoutRegionCode}/translations.json`)
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
            <EventPublishingRouter history={createHistory()}>
                <App/>
            </EventPublishingRouter>
        </IntlInit>
    </IntlProvider>,
    document.getElementById('app')
)