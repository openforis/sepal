import {Button} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Constraint, Field, Form, Input, form} from 'widget/form'
import {PropTypes} from 'prop-types'
import {history, query} from 'route'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
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
        const {action} = this.props
        const tokenValidated = action('VALIDATE_TOKEN').dispatched
        return tokenValidated
            ? this.form()
            : this.spinner()
    }

    spinner() {
        return (
            <CenteredProgress title={msg('landing.reset-password.validating-link')}/>
        )
    }

    form() {
        const {form, inputs: {username, password, password2}, action} = this.props
        const resettingPassword = action('RESET_PASSWORD').dispatching
        return (
            <Form onSubmit={() => this.resetPassword(form.values())}>
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

                <Button
                    type='submit'
                    look='apply'
                    size='x-large'
                    shape='pill'
                    icon={resettingPassword ? 'spinner' : 'sign-in-alt'}
                    label={msg('landing.reset-password.button')}
                    disabled={form.isInvalid() || resettingPassword}
                    tabIndex={3}
                />
            </Form>
        )
    }
}

ResetPassword.propTypes = {
    user: PropTypes.object
}

export default form({fields, constraints, mapStateToProps})(ResetPassword)
