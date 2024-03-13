import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {EMPTY, catchError, forkJoin, switchMap, tap} from 'rxjs'
import {Form} from 'widget/form'
import {FormContainer} from 'widget/form/container'
import {Layout} from 'widget/layout'
import {Notifications} from 'widget/notifications'
import {compose} from 'compose'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {signUp$, validateEmail$, validateUsername$} from 'user'
import {withForm} from 'widget/form/form'
import {withRecaptcha} from 'widget/recaptcha'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.signup.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'landing.signup.username.format'),
    name: new Form.Field()
        .notBlank('landing.signup.name.required'),
    email: new Form.Field()
        .notBlank('landing.signup.email.required')
        .email('landing.signup.email.format'),
    organization: new Form.Field()
        .notBlank('landing.signup.organization.required'),
}

const mapStateToProps = () => ({
    // errors: invalidCredentials() ? {password: msg('landing.signup.password.invalid')} : {}
})

class _SignUp extends React.Component {
    constructor(props) {
        super(props)
        this.next = this.next.bind(this)
        this.back = this.back.bind(this)
        this.submit = this.submit.bind(this)
        this.checkUsername = this.checkUsername.bind(this)
        this.checkEmail = this.checkEmail.bind(this)
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
        const {inputs: {username, name, email, organization}, action, onCancel} = this.props
        return (
            <Layout spacing='loose'>
                <Layout spacing='normal'>
                    <Form.Input
                        label={msg('landing.signup.username.label')}
                        input={username}
                        placeholder={msg('landing.signup.username.placeholder')}
                        autoFocus
                        tabIndex={1}
                        busyMessage={this.props.stream('VALIDATE_USERNAME').active && msg('widget.loading')}
                        onBlur={this.checkUsername}
                    />
                    <Form.Input
                        label={msg('landing.signup.name.label')}
                        input={name}
                        placeholder={msg('landing.signup.name.placeholder')}
                        tabIndex={2}
                    />
                    <Form.Input
                        label={msg('landing.signup.email.label')}
                        input={email}
                        placeholder={msg('landing.signup.email.placeholder')}
                        tabIndex={3}
                        busyMessage={this.props.stream('VALIDATE_EMAIL').active && msg('widget.loading')}
                        onBlur={this.checkEmail}
                    />
                    <Form.Input
                        label={msg('landing.signup.organization.label')}
                        input={organization}
                        placeholder={msg('landing.signup.organization.placeholder')}
                        tabIndex={4}
                    />
                </Layout>
                <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                    <Button
                        chromeless
                        look='transparent'
                        size='x-large'
                        shape='pill'
                        icon='arrow-left'
                        label={msg('landing.forgot-password.cancel-link')}
                        tabIndex={-1}
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
                        label={msg('landing.signup.button')}
                        disabled={this.isSubmitDisabled()}
                        tabIndex={3}
                    />
                </ButtonGroup>
            </Layout>
        )
    }

    checkUsername$() {
        const {inputs: {username}, recaptcha: {recaptcha$}} = this.props
        return recaptcha$('VALIDATE_USERNAME').pipe(
            switchMap(recaptchaToken =>
                validateUsername$({username: username.value, recaptchaToken})
            ),
            tap(valid => {
                username.setInvalid(
                    username.isInvalid() || !valid && msg('landing.signup.username.duplicate')
                )
            }),
            catchError(error => {
                username.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('landing.signup.username.cannotValidate')
                )
            })
        )
    }

    checkUsername() {
        const {inputs: {username}, stream} = this.props
        if (username && !username.isInvalid()) {
            stream('VALIDATE_USERNAME', this.checkUsername$())
        }
    }

    checkEmail$() {
        const {inputs: {email}, recaptcha: {recaptcha$}} = this.props
        return recaptcha$('VALIDATE_EMAIL').pipe(
            switchMap(recaptchaToken =>
                validateEmail$({email: email.value, recaptchaToken})
            ),
            tap(valid => {
                email.setInvalid(
                    email.isInvalid() || !valid && msg('landing.signup.email.duplicate')
                )
            }),
            catchError(error => {
                email.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('landing.signup.email.cannotValidate')
                )
            })
        )
    }

    checkEmail() {
        const {inputs: {email}, stream} = this.props
        if (email && !email.isInvalid()) {
            stream('VALIDATE_EMAIL', this.checkEmail$())
        }
    }

    submit() {
        const {form} = this.props
        this.signup(form.values())
    }

    signup(userDetails) {
        const {onCancel, recaptcha: {recaptcha$}, stream} = this.props
        const {email} = userDetails
        stream('SIGN_UP',
            forkJoin(this.checkUsername$(), this.checkEmail$()).pipe(
                switchMap(([usernameValid, emailValid]) => {
                    if (usernameValid && emailValid) {
                        return recaptcha$('SIGN_UP').pipe(
                            switchMap(recaptchaToken => signUp$(userDetails, recaptchaToken))
                        )
                    } else {
                        return EMPTY
                    }
                })
            ),
            success => {
                if (success) {
                    Notifications.success({message: msg('landing.signup.success', {email})})
                    publishEvent('signed_up')
                    onCancel()
                }
            },
            error => console.error({error})
        )
    }

    isSubmitDisabled() {
        const {form, action} = this.props
        return form.isInvalid() || action('SIGN_UP').dispatching
    }

    next() {
        this.setState(({formPage}) => ({formPage: formPage + 1}))
    }

    back() {
        this.setState(({formPage}) => ({formPage: formPage - 1}))
    }
}

export const SignUp = compose(
    _SignUp,
    withForm({fields, mapStateToProps}),
    withRecaptcha()
)

SignUp.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
