import {IntlProvider, injectIntl} from 'react-intl'
import PropTypes from 'prop-types'
import React from 'react'
import flat from 'flat'

let intl
export const initIntl = intlInstance => intl = intlInstance

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
    const idString = flattenDeep(id).join('.')
    return intl.formatMessage({
        id: String(idString),
        defaultMessage: defaultMessage || idString
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

export const setLanguage = (language) => {
    localStorage.setItem(languageKey, language)
    return language
}

export default class TranslationProvider extends React.Component {
    state = {}

    shouldComponentUpdate(nextProps, nextState) {
        return this.state.language !== nextState.language
    }

    static getDerivedStateFromProps(props, state) {
        const languageState = (language) => {
            const messages = flat.flatten( // react-intl requires a flat object
                require(`locale/${language}/translations.json`)
            )
            return {...state, messages, language}
        }
        let language = getLanguage()
        if (language === state.language)
            return state
        else {
            try {
                return languageState(language)
            } catch (error) {
                return languageState(setLanguage('en'))
            }
        }
    }

    render() {
        const {children} = this.props
        const {language, messages} = this.state
        return (
            <IntlProvider locale={language} messages={messages}>
                <IntlInit>
                    {children}
                </IntlInit>
            </IntlProvider>
        )
    }
}

class IntlInitializer extends React.Component {
    constructor(props) {
        super(props)
        initIntl(this.props.intl)
        // TODO: resolve references here
    }

    render() {
        return this.props.children
    }

    componentDidUpdate() {
        initIntl(this.props.intl)
    }
}

IntlInitializer.propTypes = {
    children: PropTypes.any,
    intl: PropTypes.object
}

const IntlInit = injectIntl(IntlInitializer)

// Read language from local storage, fallback to default
