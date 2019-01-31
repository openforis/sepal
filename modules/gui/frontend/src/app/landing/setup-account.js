import {CenteredProgress} from 'widget/progress'
import {Constraint, Field, Form, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {PropTypes} from 'prop-types'
import {SubmitButton} from 'widget/legacyButton'
import {history, query} from 'route'
import {isMobile} from 'widget/userAgent'
import {resetPassword$, tokenUser, validateToken$} from 'user'
import Notifications from 'widget/notifications'
import React from 'react'

const fields = {
    username: null,
    password: new Field()
        .notBlank('landing.reset-password.password.required'),
    password2: new Field()
        .notBlank('landing.reset-password.password2.required')

}

const constraints = {
    passwordsMatch: new Constraint(['password', 'password2'])
        .predicate(({password, password2}) =>
            !password || password === password2,
        'landing.reset-password.password2.not-matching')
}

const mapStateToProps = () => ({
    user: tokenUser()
})

class ResetPassword extends React.Component {
    UNSAFE_componentWillMount() {
        const token = query().token
        this.props.asyncActionBuilder('VALIDATE_TOKEN',
            validateToken$(token))
            .onComplete(([tokenValidated]) => {
                if (!tokenValidated.valid) {
                    Notifications.error({message: msg('landing.validate-token.error')})
                    return history().push('/')
                }
            })
            .dispatch()
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
        const {user, inputs: {username}} = nextProps
        username.set(user && user.username)
    }

    resetPassword({username, password}) {
        const token = query().token
        this.props.asyncActionBuilder('RESET_PASSWORD',
            resetPassword$(token, username, password))
            .onComplete(() => {
                Notifications.success({message: msg('landing.reset-password.success')})
                return history().push('/')
            })
            .dispatch()
    }

    render() {
        if (!this.props.action('VALIDATE_TOKEN').dispatched)
            return this.spinner()
        else
            return this.form()
    }

    spinner() {
        return (
            <CenteredProgress title={msg('landing.reset-password.validating-link')}/>
        )
    }

    form() {
        const {form, inputs: {username, password, password2}} = this.props
        return (
            <Form>
                <Input
                    label={msg('landing.reset-password.username.label')}
                    input={username}
                    disabled={true}
                    errorMessage
                />
                <Input
                    label={msg('landing.reset-password.password.label')}
                    input={password}
                    type='password'
                    placeholder={msg('landing.reset-password.password.placeholder')}
                    autoFocus={!isMobile()}
                    tabIndex={1}
                    errorMessage
                />
                <Input
                    label={msg('landing.reset-password.password2.label')}
                    input={password2}
                    type='password'
                    placeholder={msg('landing.reset-password.password2.placeholder')}
                    tabIndex={2}
                    errorMessage={[password2, 'passwordsMatch']}
                />

                <SubmitButton
                    icon='sign-in-alt'
                    onClick={() => this.resetPassword(form.values())}
                    disabled={form.isInvalid()}
                    tabIndex={3}>
                    <Msg id='landing.reset-password.button'/>
                </SubmitButton>
            </Form>
        )
    }
}

ResetPassword.propTypes = {
    user: PropTypes.object
}

export default form({fields, constraints, mapStateToProps})(ResetPassword)
