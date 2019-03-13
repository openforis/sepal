import {AnimateReplacement} from '../../widget/animate'
import {isPathInLocation} from 'route'
import ForgotPassword from './forgot-password'
import Login from './login'
import React from 'react'
import ResetPassword from './reset-password'
import SetupAccount from './setup-account'
import styles from './credentials.module.css'

export default class Credentials extends React.Component {
    state = {
        forgotPassword: false
    }

    switchToLogin() {
        this.setState(prevState => ({
            ...prevState,
            forgotPassword: false
        }))
    }

    switchToForgotPassword() {
        this.setState(prevState => ({
            ...prevState,
            forgotPassword: true
        }))
    }

    renderForgotPassword() {
        return (
            <ForgotPassword onCancel={() => this.switchToLogin()}/>
        )
    }

    renderLogin() {
        return (
            <Login onForgotPassword={() => this.switchToForgotPassword()}/>
        )
    }

    renderPanel() {
        if (isPathInLocation('/reset-password')) {
            return <ResetPassword/>
        }
        if (isPathInLocation('/setup-account')) {
            return <SetupAccount/>
        }
        return this.state.forgotPassword
            ? this.renderForgotPassword()
            : this.renderLogin()
    }

    render() {
        const {forgotPassword} = this.state
        const ANIMATION_DURATION_MS = 500
        return (
            <React.Fragment>
                <div className={styles.container}>
                    <AnimateReplacement
                        currentKey={forgotPassword}
                        timeout={ANIMATION_DURATION_MS}
                        classNames={{enter: styles.formEnter, exit: styles.formExit}}
                        style={{height: '100%', '--animation-duration': `${ANIMATION_DURATION_MS}ms`}}>
                        <div className={styles.form}>
                            {this.renderPanel()}
                        </div>
                    </AnimateReplacement>
                </div>
            </React.Fragment>
        )
    }
}

Credentials.propTypes = {}
