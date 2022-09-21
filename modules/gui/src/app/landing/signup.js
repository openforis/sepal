import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {signUp$, validateEmail$, validateUsername$} from 'user'
import {switchMap} from 'rxjs'
import {withRecaptchaContext} from 'widget/recaptcha'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.signup.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'landing.signup.form.username.format'),
    name: new Form.Field()
        .notBlank('landing.signup.name.required'),
    email: new Form.Field()
        .notBlank('landing.signup.email.required')
        .email('landing.signup.email.format'),
    organization: new Form.Field()
        .notBlank('landing.signup.organization.required'),
    intendedUse: new Form.Field()
        .notBlank('landing.signup.intendedUse.required')
}

const mapStateToProps = () => ({
    // errors: invalidCredentials() ? {password: msg('landing.signup.password.invalid')} : {}
})

class _SignUp extends React.Component {
    state = {
        formPage: 1
    }

    constructor(props) {
        super(props)
        this.next = this.next.bind(this)
        this.back = this.back.bind(this)
        this.submit = this.submit.bind(this)
        this.validateUsername = this.validateUsername.bind(this)
        this.validateEmail = this.validateEmail.bind(this)
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
        const {formPage} = this.state
        switch (formPage) {
        case 1: return this.renderFirstPage()
        case 2: return this.renderSecondPage()
        }
    }

    renderFirstPage() {
        const {inputs: {username, name, email, organization}, onCancel} = this.props
        return (
            <Layout spacing='normal'>
                <Form.Input
                    label={msg('landing.signup.username.label')}
                    input={username}
                    placeholder={msg('landing.signup.username.placeholder')}
                    autoFocus
                    tabIndex={1}
                    busyMessage={this.props.stream('VALIDATE_USERNAME').active && msg('widget.loading')}
                    errorMessage
                    onBlur={this.validateUsername}
                />
                <Form.Input
                    label={msg('landing.signup.name.label')}
                    input={name}
                    placeholder={msg('landing.signup.name.placeholder')}
                    tabIndex={2}
                    errorMessage
                />
                <Form.Input
                    label={msg('landing.signup.email.label')}
                    input={email}
                    placeholder={msg('landing.signup.email.placeholder')}
                    tabIndex={3}
                    busyMessage={this.props.stream('VALIDATE_EMAIL').active && msg('widget.loading')}
                    errorMessage
                    onBlur={this.validateEmail}
                />
                <Form.Input
                    label={msg('landing.signup.organization.label')}
                    input={organization}
                    placeholder={msg('landing.signup.organization.placeholder')}
                    tabIndex={4}
                    errorMessage
                />
                <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                    <Button
                        chromeless
                        look='transparent'
                        size='x-large'
                        shape='pill'
                        icon='undo'
                        label={msg('landing.forgot-password.cancel-link')}
                        tabIndex={5}
                        onMouseDown={e => e.preventDefault()}
                        onClick={onCancel}
                    />
                    <Button
                        look='apply'
                        size='x-large'
                        shape='pill'
                        icon={'arrow-right'}
                        label={msg('button.next')}
                        tabIndex={6}
                        onClick={this.next}
                    />
                </ButtonGroup>
            </Layout>
        )
    }

    renderSecondPage() {
        const {inputs: {intendedUse}, action} = this.props
        return (
            <Layout spacing='normal'>
                <Form.Input
                    textArea
                    minRows={5}
                    maxRows={10}
                    label={msg('landing.signup.intendedUse.label')}
                    input={intendedUse}
                    placeholder={msg('landing.signup.intendedUse.placeholder')}
                    tabIndex={1}
                    errorMessage
                />
                <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                    <Button
                        type='submit'
                        look='apply'
                        size='x-large'
                        shape='pill'
                        icon={'arrow-left'}
                        label={msg('button.back')}
                        tabIndex={2}
                        onClick={this.back}
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

    validateUsername() {
        const {inputs: {username}, recaptchaContext: {recaptcha$}, stream} = this.props
        if (username && !username.isInvalid()) {
            stream('VALIDATE_USERNAME',
                recaptcha$('VALIDATE_USERNAME').pipe(
                    switchMap(recaptchaToken =>
                        validateUsername$({username: username.value, recaptchaToken})
                    )
                ),
                ({valid}) => {
                    username.setInvalid(
                        username.isInvalid() || !valid && msg('landing.signup.username.duplicate')
                    )
                    this.setState({validatingUsername: false})
                },
                error => {
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('landing.signup.username.cannotValidate')
                    this.setState({validatingUsername: false})
                }
            )
        }
    }

    validateEmail() {
        const {inputs: {email}, recaptchaContext: {recaptcha$}, stream} = this.props
        if (email && !email.isInvalid()) {
            stream('VALIDATE_EMAIL',
                recaptcha$('VALIDATE_EMAIL').pipe(
                    switchMap(recaptchaToken =>
                        validateEmail$({email: email.value, recaptchaToken})
                    )
                ),
                ({valid}) => {
                    email.setInvalid(
                        email.isInvalid() || !valid && msg('landing.signup.email.duplicate')
                    )
                    this.setState({validatingEmail: false})
                },
                error => {
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('landing.signup.email.cannotValidate')
                    this.setState({validatingEmail: false})
                }
            )
        }
    }

    submit() {
        const {form} = this.props
        this.signup(form.values())
    }

    signup(userDetails) {
        const {onCancel, recaptchaContext: {recaptcha$}, stream} = this.props
        const {email} = userDetails
        stream('SIGN_UP',
            recaptcha$('SIGN_UP').pipe(
                switchMap(recaptchaToken => signUp$(userDetails, recaptchaToken))
            ),
            () => {
                Notifications.success({message: msg('landing.signup.success', {email})})
                publishEvent('signed_up')
                onCancel()
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
    form({fields, mapStateToProps}),
    withRecaptchaContext()
)

SignUp.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
