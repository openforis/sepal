import React from 'react'
import ReactDOM from 'react-dom'
import {createLogger} from 'redux-logger'
import {createEpicMiddleware} from 'redux-observable'
import {composeWithDevTools} from 'redux-devtools-extension'
import {applyMiddleware, createStore} from 'redux'
import {initStore} from 'store'
import {Provider} from 'react-redux'
import {addLocaleData, injectIntl, IntlProvider} from 'react-intl'
import en from 'react-intl/locale-data/en'
import es from 'react-intl/locale-data/es'
import flat from 'flat'
import {initIntl} from 'translate'
import App from 'app/app'
import Rx from 'rxjs'
import createHistory from 'history/createBrowserHistory'
import {EventPublishingRouter} from 'route'

// https://github.com/jcbvm/i18n-editor
addLocaleData([...en, ...es])
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0]
const messages = flat.flatten( // react-intl requires a flat object
    require(`locale/${languageWithoutRegionCode}/translations.json`)
)

const rootEpic = (action$) =>
    action$
        .filter(action => 'epic' in action && typeof action.epic === 'function')
        .mergeMap((action) => {
            let result$ = action.epic(Rx.Observable.of(action))
            // if ('dispatched' in action) {
            //     const dispatched$ = action.dispatched()
            //     if (dispatched$)
            //         result$ = Rx.Observable.merge(Rx.Observable.of(dispatched$), result$)
            // }
            // if ('completed' in action) {
            //     result$ = result$.last().map((completeAction) => {
            //         console.log('completeAction', completeAction)
            //         const completed$ = action.completed()
            //         return completeAction
            //     })
            // }
            // if ('cancel$' in action)
            //     result$ = result$.takeUntil(action.cancel$)
            return result$
        })

const epicMiddleware = createEpicMiddleware(rootEpic)


const rootReducer = (state, action) => {
    if ('reduce' in action)
        return action.reduce(state)
    else
        return state
}
const store = createStore(
    rootReducer,
    composeWithDevTools(applyMiddleware(
        createLogger(), epicMiddleware
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

ReactDOM.render(
    <IntlProvider locale={language} messages={messages}>
        <IntlInit>
            <Provider store={store}>
                <EventPublishingRouter history={createHistory()}>
                    <App/>
                </EventPublishingRouter>
            </Provider>
        </IntlInit>
    </IntlProvider>,
    document.getElementById('app')
)