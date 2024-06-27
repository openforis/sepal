import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {from, throwError} from 'rxjs'

import {withContext} from '~/context'
import {getLogger} from '~/log'

const log = getLogger('recaptcha')

const Context = React.createContext()

export const withRecaptcha = withContext(Context, 'recaptcha')

export class Recaptcha extends React.Component {
    state = {
        loaded: false
    }

    constructor(props) {
        super(props)
        this.handleLoaded = this.handleLoaded.bind(this)
        this.recaptcha$ = this.recaptcha$.bind(this)
    }

    render() {
        const {siteKey, children} = this.props
        const {loaded} = this.state
        return loaded ? (
            <Context.Provider value={{recaptcha$: this.recaptcha$}}>
                <div
                    className="g-recaptcha"
                    data-sitekey={siteKey}
                    data-size="invisible"
                />
                {children}
            </Context.Provider>
        ) : null
    }

    recaptcha$(action) {
        const {siteKey} = this.props
        log.debug(`Requesting reCAPTCHA assessment: ${action}`)
        try {
            return from(window.grecaptcha.execute(siteKey, {action}))
        } catch (error) {
            log.error('Cannot request reCAPTCHA assessment', error)
            return throwError(() => error)
        }
    }

    componentDidMount() {
        this.loadRecaptcha()
    }

    componentWillUnmount() {
        this.removeRecaptchaBadge()
    }
    
    removeRecaptchaBadge() {
        const recaptchaBadge = document.getElementsByClassName('grecaptcha-badge')
        recaptchaBadge && _.forEach(recaptchaBadge, element => element.remove())
    }

    loadRecaptcha() {
        const {siteKey} = this.props
        log.debug('Loading Google reCAPTCHA')
        if (!window.grecaptcha) {
            const script = document.createElement('script')
            script.setAttribute('type', 'text/javascript')
            script.setAttribute('src', `https://www.google.com/recaptcha/api.js?render=${siteKey}`)
            script.addEventListener('load', this.handleLoaded)
            document.body.appendChild(script)
        } else {
            log.debug('Google reCAPTCHA already loaded')
        }
    }
    
    handleLoaded() {
        window.grecaptcha.ready(() => {
            log.debug('Google reCAPTCHA loaded')
            this.setState({loaded: true})
        })
    }
}

Recaptcha.propTypes = {
    siteKey: PropTypes.string.isRequired,
    children: PropTypes.any
}
