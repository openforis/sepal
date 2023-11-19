import {IntlProvider, injectIntl} from 'react-intl'
import {flatten} from 'flat'
import {getLogger} from 'log'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'

const log = getLogger('translate')

let intl, intlEn
const initIntl = intlInstance => intl = intlInstance
const initIntlEn = intlInstance => intlEn = intlInstance

export const Msg = ({id, ...values}) => (
    <span>{msg(id, values)}</span>
)

Msg.propTypes = {
    id: PropTypes.any.isRequired
}

const flattenDeep = arr => Array.isArray(arr)
    ? arr.reduce((a, b) => a.concat(flattenDeep(b)), [])
    : [arr]

export const msg = (id, values = {}, defaultMessage) => {
    values = _.transform(values, (result, value, key) =>
        result[key] = _.isString(value) ? value : JSON.stringify(value)
    )
    const idString = String(flattenDeep(id).join('.'))
    return intl.formatMessage({
        id: idString,
        defaultMessage: defaultMessage || (
            getLanguage() === 'en'
                ? idString
                : intlEn.formatMessage({
                    id: idString,
                    defaultMessage: idString
                }, values)
        )
    }, values)
}

const languageKey = 'sepal:language'

export const getLanguage = () => {
    let language = localStorage.getItem(languageKey)
    if (!language) {
        language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage
        language = language.toLowerCase().split(/[_-]+/)[0]
        setLanguage(language)
    }
    return language
}

export const setLanguage = language => {
    localStorage.setItem(languageKey, language)
    return language
}

export default class TranslationProvider extends React.Component {
    state = {}

    shouldComponentUpdate(nextProps, nextState) {
        return this.state.language !== nextState.language
    }

    static getDerivedStateFromProps(props, state) {
        const languageState = language => {
            const loadTranslations = language => flatten( // react-intl requires a flat object
                require(`locale/${language}/translations.json`)
            )
            const messages = loadTranslations(language)
            const messagesEn = language === 'en'
                ? messages
                : loadTranslations('en')
            require('moment/min/locales.min') // Load all moment locales

            moment.locale(language)
            return {...state, messages, messagesEn, language}
        }
        let language = getLanguage()
        if (language === state.language) {
            return state
        } else {
            try {
                return languageState(language)
            } catch (error) {
                return languageState(setLanguage('en'))
            }
        }
    }

    render() {
        const {children} = this.props
        const {language, messages, messagesEn} = this.state
        return (
            <IntlProvider locale={'en'} messages={messagesEn}>
                <IntlInitEn>
                    <IntlProvider locale={language} messages={messages} onError={error => log.info(error.message)}>
                        <IntlInit>
                            {children}
                        </IntlInit>
                    </IntlProvider>
                </IntlInitEn>
            </IntlProvider>
        )
    }
}

class IntlInitializer extends React.Component {
    constructor(props) {
        super(props)
        initIntl(this.props.intl)
    }

    render() {
        return this.props.children
    }

    componentDidUpdate() {
        initIntl(this.props.intl)
    }
}

class IntlInitializerEn extends React.Component {
    constructor(props) {
        super(props)
        initIntlEn(this.props.intl)
    }

    render() {
        return this.props.children
    }
}

IntlInitializer.propTypes = {
    children: PropTypes.any,
    intl: PropTypes.object
}

const IntlInit = injectIntl(IntlInitializer)
const IntlInitEn = injectIntl(IntlInitializerEn)

// Read language from local storage, fallback to default
