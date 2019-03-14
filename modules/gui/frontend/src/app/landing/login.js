import {Button} from 'widget/button'
import {Field, Form, Input, form} from 'widget/form'
import {invalidCredentials, login$, resetInvalidCredentials} from 'widget/user'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './login.module.css'

const fields = {
    username: new Field()
        .notBlank('landing.login.username.required'),
    password: new Field()
        .notBlank('landing.login.password.required')
}

const mapStateToProps = () => ({
    errors: invalidCredentials() ? {password: msg('landing.login.password.invalid')} : {}
})

class Login extends React.Component {
    login({username, password}) {
        this.props.stream('LOGIN', login$(username, password))
    }

    componentWillUnmount() {
        resetInvalidCredentials()
    }

    forgotPassword() {
        const {onForgotPassword} = this.props
        onForgotPassword()
    }

    render() {
        const {form, inputs: {username, password}, action} = this.props
        return (
            <Form className={styles.form} onSubmit={() => this.login(form.values())}>
                <div className={styles.inputs}>
                    <Input
                        label={msg('landing.login.username.label')}
                        input={username}
                        placeholder={msg('landing.login.username.placeholder')}
                        autoFocus={!isMobile()}
                        tabIndex={1}
                        errorMessage
                    />
                    <Input
                        label={msg('landing.login.password.label')}
                        input={password}
                        type='password'
                        placeholder={msg('landing.login.password.placeholder')}
                        tabIndex={2}
                        errorMessage
                    />
                </div>
                <div className={styles.buttons}>
                    <Button
                        chromeless
                        look='transparent'
                        size='large'
                        shape='pill'
                        label={msg('landing.login.forgot-password-link')}
                        tabIndex={4}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => this.forgotPassword()}
                    />
                    <Button
                        type='submit'
                        look='apply'
                        size='x-large'
                        shape='pill'
                        icon={action('LOGIN').dispatching ? 'spinner' : 'sign-in-alt'}
                        label={msg('landing.login.button')}
                        disabled={form.isInvalid() || action('LOGIN').dispatching}
                        tabIndex={3}
                    />
                </div>
            </Form>)
    }
}

Login.propTypes = {
    onForgotPassword: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields, mapStateToProps})(Login)

