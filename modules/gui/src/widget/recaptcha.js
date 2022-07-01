import PropTypes from 'prop-types'
import React, {useEffect} from 'react'

export const Recaptcha = ({children, action, siteKey, onToken}) => {
    const handleLoaded = () => {
        if (!children) {
            window.grecaptcha.enterprise.ready(executeRecaptcha)
        }
    }

    const executeRecaptcha = async () => {
        const token = await window.grecaptcha.enterprise.execute(siteKey, {action})
        onToken && onToken(token)
    }
      
    useEffect(() => {
        if (!window.grecaptcha) {
            const script = document.createElement('script')
            script.setAttribute('type', 'text/javascript')
            script.setAttribute('src', `https://www.google.com/recaptcha/enterprise.js?render=${siteKey}`)
            script.addEventListener('load', handleLoaded)
            document.body.appendChild(script)
        } else {
            if (!children) {
                executeRecaptcha()
            }
        }
    }, [])
      
    return (
        <React.Fragment>
            <div
                className="g-recaptcha"
                data-sitekey={siteKey}
                data-size="invisible"
            />
            {children && children(executeRecaptcha)}
        </React.Fragment>
    )
}

Recaptcha.propTypes = {
    action: PropTypes.string.isRequired,
    siteKey: PropTypes.string.isRequired,
    onToken: PropTypes.func.isRequired,
    children: PropTypes.func
}
