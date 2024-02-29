import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, withForm} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Notifications} from 'widget/notifications'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {msg} from 'translate'
import {requestPasswordReset$} from 'user'
import {switchMap} from 'rxjs'
import {withRecaptcha} from 'widget/recaptcha'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './forgot-password.module.css'

const fields = {
    email: new Form.Field()
        .notBlank('landing.forgot-password.required')
        .email('landing.forgot-password.invalid')
}

class _ForgotPassword extends React.Component {
    constructor(props) {
        super(props)
        this.submit = this.submit.bind(this)
    }

    render() {
        return (
            <Form
                className={styles.form}
                onSubmit={this.submit}>
                {this.renderForm()}
            </Form>
        )
    }

    renderForm() {
        const {form, inputs: {email}, action, onCancel} = this.props
        return (
            <div className={styles.inputs}>
                <Layout spacing='loose'>
                    <Widget
                        label={msg('landing.forgot-password.label')}
                        contentClassName={styles.instructions}>
                        {msg('landing.forgot-password.instructions')}
                    </Widget>
                    <Form.Input
                        label={msg('user.userDetails.form.email.label')}
                        input={email}
                        placeholder={msg('landing.forgot-password.email.placeholder')}
                        autoFocus
                        autoComplete='off'
                        tabIndex={1}
                        validate='onBlur'
                    />
                    <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                        <Button
                            chromeless
                            look='transparent'
                            size='x-large'
                            shape='pill'
                            icon='arrow-left'
                            label={msg('landing.forgot-password.cancel-link')}
                            tabIndex={3}
                            keybinding='Escape'
                            onMouseDown={e => e.preventDefault()}
                            onClick={onCancel}
                        />
                        <Button
                            type='submit'
                            look='apply'
                            size='x-large'
                            shape='pill'
                            icon={action('REQUEST_PASSWORD_RESET').dispatching ? 'spinner' : 'envelope'}
                            label={msg('landing.forgot-password.button')}
                            disabled={form.isInvalid() || action('REQUEST_PASSWORD_RESET').dispatching}
                            tabIndex={2}
                        />
                    </ButtonGroup>
                </Layout>
            </div>
        )
    }

    submit() {
        const {inputs: {email}} = this.props
        this.requestPasswordReset(email.value)
    }

    requestPasswordReset(email) {
        const {recaptcha: {recaptcha$}, stream} = this.props
        const {onCancel} = this.props
        stream('REQUEST_PASSWORD_RESET',
            recaptcha$('REQUEST_PASSWORD_RESET').pipe(
                switchMap(recaptchaToken =>
                    requestPasswordReset$({email, optional: true}, recaptchaToken)
                )
            ),
            () => {
                Notifications.success({message: msg('landing.forgot-password.success', {email})})
                onCancel()
            },
            () => {
                Notifications.error({message: msg('landing.forgot-password.error')})
                onCancel()
            }
        )
    }
}

export const ForgotPassword = compose(
    _ForgotPassword,
    withForm({fields}),
    withRecaptcha()
)

ForgotPassword.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
