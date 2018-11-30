import {Button} from 'widget/button'
import {Field, Input, form} from 'widget/form'
import {history} from 'route'
import {msg} from 'translate'
import {requestPasswordReset$} from 'user'
import Notifications from 'app/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './forgot-password.module.css'

const fields = {
    email: new Field()
        .notBlank('landing.forgot-password.required')
        .email('landing.forgot-password.invalid')
}

export class ForgotPassword extends React.Component {
    cancel() {
        const {onCancel} = this.props
        onCancel()
    }

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
        return (
            <form className={styles.form}>
                <div className={styles.inputs}>
                    <Input
                        label={msg('landing.forgot-password.label')}
                        input={email}
                        placeholder={msg('landing.forgot-password.placeholder')}
                        autoFocus='on'
                        autoComplete='off'
                        tabIndex={1}
                        validate='onBlur'
                        errorMessage
                    />
                </div>
                <div className={styles.buttons}>
                    <Button
                        type='submit'
                        look='highlight'
                        size='large'
                        shape='pill'
                        icon={action('REQUEST_PASSWORD_RESET').dispatching ? 'spinner' : 'sign-in-alt'}
                        label={msg('landing.forgot-password.button')}
                        onClick={() => this.requestPasswordReset(email.value)}
                        disabled={form.isInvalid() || action('REQUEST_PASSWORD_RESET').dispatching}
                        tabIndex={2}
                    />
                    <Button
                        chromeless
                        look='transparent'
                        size='large'
                        shape='pill'
                        icon='undo'
                        label={msg('landing.forgot-password.cancel-link')}
                        tabIndex={3}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => this.cancel()}
                    />
                </div>
            </form>
        )
    }
}

ForgotPassword.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields})(ForgotPassword)
