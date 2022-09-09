import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {msg} from 'translate'
import {requestPasswordReset$} from 'user'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './forgot-password.module.css'

const fields = {
    email: new Form.Field()
        .notBlank('landing.forgot-password.required')
        .email('landing.forgot-password.invalid')
}

class _ForgotPassword extends React.Component {
    requestPasswordReset(email) {
        const {onCancel} = this.props
        this.props.stream('REQUEST_PASSWORD_RESET',
            requestPasswordReset$({email, optional: true}),
            () => {
                Notifications.success({message: msg('landing.forgot-password.success', {email})})
                onCancel()
            }
        )
    }

    render() {
        const {form, inputs: {email}, action, onCancel} = this.props
        return (
            <Form
                className={styles.form}
                onSubmit={() => this.requestPasswordReset(email.value)}>
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
                            errorMessage
                        />
                        <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                            <Button
                                chromeless
                                look='transparent'
                                size='large'
                                shape='pill'
                                icon='undo'
                                label={msg('landing.forgot-password.cancel-link')}
                                tabIndex={3}
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
            </Form>
        )
    }
}

export const ForgotPassword = compose(
    _ForgotPassword,
    form({fields})
)

ForgotPassword.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
