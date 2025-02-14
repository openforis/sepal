import PropTypes from 'prop-types'
import React from 'react'
import {switchMap} from 'rxjs'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {credentialsPosted, invalidCredentials, login$} from '~/user'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Form} from '~/widget/form'
import {FormContainer} from '~/widget/form/container'
import {withForm} from '~/widget/form/form'
import {Keybinding} from '~/widget/keybinding'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {withRecaptcha} from '~/widget/recaptcha'

import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.login.username.required'),
    password: new Form.Field()
        .notBlank('landing.login.password.required')
}

const mapStateToProps = () => ({
    errors: invalidCredentials() ? {password: msg('landing.login.password.invalid')} : {}
})

class _Login extends React.Component {
    ref = React.createRef()

    constructor(props) {
        super(props)
        this.reset = this.reset.bind(this)
        this.submit = this.submit.bind(this)
    }

    render() {
        return (
            <FormContainer
                className={styles.form}
                onSubmit={this.submit}>
                {this.renderForm()}
            </FormContainer>
        )
    }

    renderForm() {
        const {form, inputs: {username, password}, onSignUp, onForgotPassword, stream} = this.props
        return (
            <Layout spacing='loose'>
                <Keybinding keymap={{'Escape': this.reset}}/>
                <Form.Input
                    ref={this.ref}
                    label={msg('user.userDetails.form.username.label')}
                    input={username}
                    placeholder={msg('landing.login.username.placeholder')}
                    autoFocus
                    tabIndex={1}
                />
                <Form.Input
                    label={msg('user.userDetails.form.password.label')}
                    input={password}
                    type='password'
                    placeholder={msg('landing.login.password.placeholder')}
                    tabIndex={2}
                />
                <Layout>
                    <ButtonGroup layout='horizontal' alignment='distribute'>
                        <Button
                            look='add'
                            size='x-large'
                            shape='pill'
                            label={msg('landing.login.sign-up')}
                            tabIndex={4}
                            // disabled={form.isDirty()}
                            onMouseDown={e => e.preventDefault()}
                            onClick={onSignUp}
                        />
                        <Button
                            type='submit'
                            look='apply'
                            size='x-large'
                            shape='pill'
                            additionalClassName={styles.loginButton}
                            icon={stream('LOGIN').active ? 'spinner' : 'sign-in-alt'}
                            label={msg('landing.login.button')}
                            disabled={form.isInvalid() || stream('LOGIN').active}
                            tabIndex={3}
                        />
                    </ButtonGroup>
                    <ButtonGroup layout='horizontal' alignment='right'>
                        <Button
                            chromeless
                            look='transparent'
                            size='x-large'
                            shape='pill'
                            label={msg('landing.login.forgot-password-link')}
                            tabIndex={5}
                            onMouseDown={e => e.preventDefault()}
                            onClick={onForgotPassword}
                        />
                    </ButtonGroup>
                </Layout>
            </Layout>
        )
    }

    reset() {
        const {form} = this.props
        const username = this.ref.current
        if (username) {
            username.focus()
            setTimeout(form.reset)
        }
    }

    submit() {
        const {form} = this.props
        this.login(form.values())
    }

    login(credentials) {
        const {stream, recaptcha: {recaptcha$}} = this.props
        stream('LOGIN',
            recaptcha$('LOGIN').pipe(
                switchMap(recaptchaToken =>
                    login$(credentials, recaptchaToken),
                )
            ),
            user => {
                credentialsPosted(user)
            },
            () => {
                Notifications.error({message: msg('landing.login.error')})
            }
        )
    }
}

export const Login = compose(
    _Login,
    withForm({fields, mapStateToProps}),
    withRecaptcha()
)

Login.propTypes = {
    onForgotPassword: PropTypes.func.isRequired,
    onSignUp: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
