import React from 'react'
import {requestPasswordReset$} from 'user'
import {history, Link} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {toMessage} from 'app/error'
import Icon from 'widget/icon'
import Button from './button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'
import styles from './forgot-password.module.css'
import Notifications from 'app/notifications'


const inputs = {
    email: new Constraints()
        .notBlank('landing.forgot-password.required')
        .email('landing.forgot-password.invalid')
}

export class ForgotPassword extends React.Component {
    requestPasswordReset(email) {
        this.props.asyncActionBuilder('REQUEST_PASSWORD_RESET',
            requestPasswordReset$(email))
            .onComplete(() => {
                history().push('/')
                return Notifications.success({
                    title: msg('landing.forgot-password.success-title'),
                    message: msg('landing.forgot-password.success-message', {email})
                })
            })
            .onError((error) =>
                Notifications.error({
                    title: msg('error-title'),
                    message: toMessage(error)
                })
            )
            .dispatch()
    }

    render() {
        const {form, inputs: {email}, dispatching} = this.props
        return <form style={styles.form}>
            <div>
                <label><Msg id='landing.forgot-password.label'/></label>
                <Input
                    input={email}
                    placeholder={msg('landing.forgot-password.placeholder')}
                    autoFocus='on'
                    autoComplete='off'
                    tabIndex={1}
                    validate='onBlur'
                />
                <ErrorMessage input={email}/>
            </div>

            <Button
                icon={dispatching.REQUEST_PASSWORD_RESET ? 'spinner' : 'paper-plane-o'}
                onSubmit={() => this.requestPasswordReset(email.value)}
                disabled={form.hasInvalid() || dispatching.REQUEST_PASSWORD_RESET}
                tabIndex={2}>
                <Msg id='landing.forgot-password.button'/>
            </Button>

            <LoginLink tabIndex={3}/>
        </form>

    }
}

export default ForgotPassword = form(inputs)(ForgotPassword)

export const LoginLink = ({tabIndex}) =>
    <div className={styles.forgotPassword}>
        <Link to='/' tabIndex={tabIndex} onMouseDown={(e) => e.preventDefault()}>
            <Icon name='undo' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.forgot-password.cancel-link'/>
        </Link>
    </div>
LoginLink.propTypes = {
    tabIndex: PropTypes.number
}

export const ForgotPasswordLink = ({tabIndex}) =>
    <div className={styles.forgotPassword}>
        <Link to='/forgot-password' tabIndex={tabIndex} onMouseDown={(e) => e.preventDefault()}>
            <Icon name='question-circle' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.login.forgot-password-link'/>
        </Link>
    </div>

ForgotPasswordLink.propTypes = {
    tabIndex: PropTypes.number
}