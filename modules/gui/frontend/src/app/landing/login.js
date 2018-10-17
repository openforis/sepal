import {Field, Input, Label, form} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import {Msg, msg} from 'translate'
import {SubmitButton} from 'widget/legacyButton'
import {invalidCredentials, login$, resetInvalidCredentials} from 'user'
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

    render() {
        const {form, inputs: {username, password}, action} = this.props
        return (
            <form>
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
                <div className={styles.submit}>
                    <SubmitButton
                        icon={action('LOGIN').dispatching ? 'spinner' : 'sign-in-alt'}
                        onClick={() => this.login(form.values())}
                        disabled={form.isInvalid() || action('LOGIN').dispatching}
                        tabIndex={3}>
                        <Msg id='landing.login.button'/>
                    </SubmitButton>
                    <ForgotPasswordLink tabIndex={4}/>
                </div>
            </form>)
    }
}

Login.propTypes = {}

export default form({fields, mapStateToProps})(Login)

