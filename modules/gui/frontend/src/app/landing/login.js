import {ErrorMessage, Field, Input, form} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import {Msg, msg} from 'translate'
import {SubmitButton} from 'widget/legacyButton'
import {invalidCredentials, login$, resetInvalidCredentials} from 'user'
import React from 'react'

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
                <div>
                    <label><Msg id='landing.login.username.label'/></label>
                    <Input
                        input={username}
                        placeholder={msg('landing.login.username.placeholder')}
                        autoFocus='on'
                        autoComplete='off'
                        tabIndex={1}/>
                    <ErrorMessage for={username}/>
                </div>
                <div>
                    <label><Msg id='landing.login.password.label'/></label>
                    <Input
                        input={password}
                        type='password'
                        placeholder={msg('landing.login.password.placeholder')}
                        tabIndex={2}/>
                    <ErrorMessage for={password}/>
                </div>

                <SubmitButton
                    icon={action('LOGIN').dispatching ? 'spinner' : 'sign-in-alt'}
                    onClick={() => this.login(form.values())}
                    disabled={form.isInvalid() || action('LOGIN').dispatching}
                    tabIndex={3}>
                    <Msg id='landing.login.button'/>
                </SubmitButton>

                <ForgotPasswordLink tabIndex={4}/>
            </form>)
    }
}

Login.propTypes = {}

export default form({fields, mapStateToProps})(Login)

