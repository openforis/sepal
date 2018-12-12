import {Button} from 'widget/button'
import {Field, Input, form} from 'widget/form'
import {invalidCredentials, login$, resetInvalidCredentials} from 'user'
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
        this.props.asyncActionBuilder('LOGIN',
            login$(username, password))
            .dispatch()
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
            <form className={styles.form}>
                <div className={styles.inputs}>
                    <Input
                        label={msg('landing.login.username.label')}
                        input={username}
                        placeholder={msg('landing.login.username.placeholder')}
                        autoFocus='on'
                        autoComplete='off'
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
                        // icon='question-circle'
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
                        onClick={() => this.login(form.values())}
                        disabled={form.isInvalid() || action('LOGIN').dispatching}
                        tabIndex={3}
                    />
                </div>
            </form>)
    }
}

Login.propTypes = {
    onForgotPassword: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields, mapStateToProps})(Login)

