import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Recaptcha} from 'widget/recaptcha'
import {compose} from 'compose'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {signUp$} from 'user'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.signUp.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'landing.signUp.form.username.format'),
    name: new Form.Field()
        .notBlank('landing.signUp.name.required'),
    email: new Form.Field()
        .notBlank('landing.signUp.email.required')
        .email('landing.signUp.email.format'),
    organization: new Form.Field()
        .notBlank('landing.signUp.organization.required'),
    intendedUse: new Form.Field()
        .notBlank('landing.signUp.intendedUse.required')
}

// const signUp = () => {
//     publishEvent('sign_up')
//     return window.location = 'https://docs.google.com/forms/d/e/1FAIpQLSci4hopXNtMOQKJzsUybaJETrAPQp8j6TCqycSBQ0XO37jBwA/viewform?c=0&w=1'
// }

const mapStateToProps = () => ({
    // errors: invalidCredentials() ? {password: msg('landing.signUp.password.invalid')} : {}
})

class _SignUp extends React.Component {
    state = {
        formPage: 1
    }

    constructor(props) {
        super(props)
        this.next = this.next.bind(this)
        this.back = this.back.bind(this)
    }

    // validateUsername(username) {
    //     const {inputs} = this.props
    //     if (username && !inputs.username.isInvalid()) {
    //         this.props.stream('VALIDATE_USERNAME',
    //             validateUsername$(username),
    //             valid => {
    //                 inputs.username.setInvalid(
    //                     inputs.username.isInvalid() || !valid && msg('landing.signUp.username.duplicate')
    //                 )
    //                 this.setState({validatingUsername: false})
    //             },
    //             error => {
    //                 error.response
    //                     ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    //                     : msg('landing.signUp.username.cannotValidate')
    //                 this.setState({validatingUsername: false})
    //             }
    //         )
    //     }
    // }

    // validateEmail(email) {
    //     const {inputs} = this.props
    //     if (email && !inputs.email.isInvalid()) {
    //         this.props.stream('VALIDATE_EMAIL',
    //             validateEmail$(email),
    //             valid => {
    //                 inputs.email.setInvalid(
    //                     inputs.email.isInvalid() || !valid && msg('landing.signUp.email.duplicate')
    //                 )
    //                 this.setState({validatingEmail: false})
    //             },
    //             error => {
    //                 error.response
    //                     ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    //                     : msg('landing.signUp.email.cannotValidate')
    //                 this.setState({validatingEmail: false})
    //             }
    //         )
    //     }
    // }

    signUp(userDetails, recaptchaToken) {
        const {stream} = this.props
        stream('SIGNUP',
            signUp$(userDetails, recaptchaToken),
            response => console.log({response}),
            error => console.error({error})
        )
    }

    componentWillUnmount() {
        // resetInvalidCredentials()
    }

    render() {
        const {form} = this.props
        return (
            <Recaptcha
                siteKey='6Lcb1rQgAAAAAAN97zORth98OcQaqVUVM7G_iQzV'
                action='SIGNUP'
                onToken={token => this.signup(form.values(), token)}>
                {executeRecaptcha => (
                    <Form
                        className={styles.form}
                        onSubmit={executeRecaptcha}>
                        {this.renderForm()}
                    </Form>
                )}
            </Recaptcha>
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
                    label={msg('landing.signUp.username.label')}
                    input={username}
                    placeholder={msg('landing.signUp.username.placeholder')}
                    autoFocus
                    tabIndex={1}
                    busyMessage={this.props.stream('VALIDATE_USERNAME').active && msg('widget.loading')}
                    errorMessage
                />
                <Form.Input
                    label={msg('landing.signUp.name.label')}
                    input={name}
                    placeholder={msg('landing.signUp.name.placeholder')}
                    tabIndex={2}
                    errorMessage
                />
                <Form.Input
                    label={msg('landing.signUp.email.label')}
                    input={email}
                    placeholder={msg('landing.signUp.email.placeholder')}
                    tabIndex={3}
                    busyMessage={this.props.stream('VALIDATE_EMAIL').active && msg('widget.loading')}
                    errorMessage
                />
                <Form.Input
                    label={msg('landing.signUp.organization.label')}
                    input={organization}
                    placeholder={msg('landing.signUp.organization.placeholder')}
                    tabIndex={4}
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
                        tabIndex={5}
                        onMouseDown={e => e.preventDefault()}
                        onClick={onCancel}
                    />
                    <Button
                        look='apply'
                        size='large'
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
                    label={msg('landing.signUp.intendedUse.label')}
                    input={intendedUse}
                    placeholder={msg('landing.signUp.intendedUse.placeholder')}
                    tabIndex={1}
                    errorMessage
                />
                <ButtonGroup layout='horizontal-nowrap' alignment='spaced'>
                    <Button
                        type='submit'
                        look='apply'
                        size='large'
                        shape='pill'
                        icon={'arrow-left'}
                        label={msg('button.back')}
                        tabIndex={2}
                        onClick={this.back}
                    />
                    <Button
                        type='submit'
                        look='apply'
                        size='large'
                        shape='pill'
                        icon={action('REQUEST_PASSWORD_RESET').dispatching ? 'spinner' : 'envelope'}
                        label={msg('landing.signUp.button')}
                        disabled={this.isSubmitDisabled()}
                        tabIndex={3}
                    />
                </ButtonGroup>
            </Layout>
        )
    }

    isSubmitDisabled() {
        const {form, action} = this.props
        return form.isInvalid() || action('SIGNUP').dispatching
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
    form({fields, mapStateToProps})
)

SignUp.propTypes = {
    onCancel: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
