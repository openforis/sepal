import {useState} from 'react'
import {useLocation} from 'react-router-dom'

import {isPathInLocation} from '~/route'
import {Recaptcha} from '~/widget/recaptcha'

import styles from './credentials.module.css'
import {ForgotPassword} from './forgot-password'
import {Login} from './login'
import {SetPassword} from './setPassword'
import {SignUp} from './signup'

export const Credentials = () => {
    const [mode, setMode] = useState('login')
    const location = useLocation()

    const switchToLogin = () =>
        setMode('login')

    const switchToSignUp = () =>
        setMode('signUp')
    
    const switchToForgotPassword = () =>
        setMode('forgotPassword')

    const renderLogin = () => (
        <Login
            onForgotPassword={switchToForgotPassword}
            onSignUp={switchToSignUp}
        />
    )

    const renderSignUp = () => (
        <SignUp
            onCancel={switchToLogin}
        />
    )

    const renderForgotPassword = () => (
        <ForgotPassword
            onCancel={switchToLogin}
        />
    )

    const renderResetPassword = () => (
        <SetPassword type='reset'/>
    )

    const renderAssignPassword = () => (
        <SetPassword type='assign'/>
    )

    const renderPanel = () => {
        if (isPathInLocation('/reset-password', location.pathname)) {
            return renderResetPassword()
        }
        if (isPathInLocation('/setup-account', location.pathname)) {
            return renderAssignPassword()
        }
        switch (mode) {
            case 'login': return renderLogin()
            case 'signUp': return renderSignUp()
            case 'forgotPassword': return renderForgotPassword()
        }
    }

    return (
        <Recaptcha siteKey={window._sepal_global_.googleRecaptchaSiteKey}>
            <div className={styles.container}>
                {renderPanel()}
            </div>
        </Recaptcha>
    )
}
