import React from 'react'
import {requestPasswordReset$} from 'user'
import {history, Link} from 'route'
import {Field, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import {SubmitButton} from 'widget/button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'
import styles from './forgot-password.module.css'
import Notifications from 'app/notifications'

const fields = {
    email: new Field()
        .notBlank('landing.forgot-password.required')
        .email('landing.forgot-password.invalid')
}

export class ForgotPassword extends React.Component {
    requestPasswordReset(email) {
        this.props.asyncActionBuilder('REQUEST_PASSWORD_RESET',
            requestPasswordReset$(email))
            .onComplete(() => [
                history().replace('/'),
                Notifications.success('landing.forgot-password', {email})
            ]
            )
            .dispatch()
    }

    render() {
        const {form, inputs: {email}, action} = this.props
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
                <ErrorMessage for={email}/>
            </div>

            <SubmitButton
                icon={action('REQUEST_PASSWORD_RESET').dispatching ? 'spinner' : 'sign-in-alt'}
                onClick={() => this.requestPasswordReset(email.value)}
                disabled={form.isInvalid() || action('REQUEST_PASSWORD_RESET').dispatching}
                tabIndex={2}>
                <Msg id='landing.forgot-password.button'/>
            </SubmitButton>

            <LoginLink tabIndex={3}/>
        </form>

    }
}

ForgotPassword.propTypes = {
    asyncActionBuilder: PropTypes.func,
    action: PropTypes.func,
    form: PropTypes.object, 
    fields: PropTypes.shape({
        email: PropTypes.string
    })
}

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

export default form({fields})(ForgotPassword)
