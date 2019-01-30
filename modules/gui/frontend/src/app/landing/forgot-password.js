import {Button} from 'widget/button'
import {Field, Form, Input, form} from 'widget/form'
import {msg} from 'translate'
import {requestPasswordReset$} from 'user'
import Label from 'widget/label'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import {isMobile} from 'widget/userAgent'
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
        this.props.stream('REQUEST_PASSWORD_RESET',
            requestPasswordReset$(email),
            () => {
                Notifications.success({message: msg('landing.forgot-password.success', {email})})
                this.cancel()
            }
        )
    }

    render() {
        const {form, inputs: {email}, action} = this.props
        return (
            <Form
                className={styles.form}
                onSubmit={() => this.requestPasswordReset(email.value)}>
                <div className={styles.inputs}>
                    <Label msg={msg('landing.forgot-password.label')}/>
                    <div className={styles.instructions}>
                        {msg('landing.forgot-password.instructions')}
                    </div>
                    <Input
                        input={email}
                        placeholder={msg('landing.forgot-password.placeholder')}
                        autoFocus={!isMobile()}
                        autoComplete='off'
                        tabIndex={1}
                        validate='onBlur'
                        errorMessage
                    />
                </div>
                <div className={styles.buttons}>
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
                    <Button
                        type='submit'
                        look='apply'
                        size='x-large'
                        shape='pill'
                        icon={action('REQUEST_PASSWORD_RESET').dispatching ? 'spinner' : 'sign-in-alt'}
                        label={msg('landing.forgot-password.button')}
                        disabled={form.isInvalid() || action('REQUEST_PASSWORD_RESET').dispatching}
                        tabIndex={2}
                    />
                </div>
            </Form>
        )
    }
}

ForgotPassword.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields})(ForgotPassword)
