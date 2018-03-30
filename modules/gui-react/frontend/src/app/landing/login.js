import React from 'react'
import {invalidCredentials, login$, resetInvalidCredentials} from 'user'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import {SubmitButton} from 'widget/button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'

const inputs = {
    username: new Constraints()
        .notBlank('landing.login.username.required'),
    password: new Constraints()
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
                    <ErrorMessage input={username}/>
                </div>
                <div>
                    <label><Msg id='landing.login.password.label'/></label>
                    <Input
                        input={password}
                        type='password'
                        placeholder={msg('landing.login.password.placeholder')}
                        tabIndex={2}/>
                    <ErrorMessage input={password}/>
                </div>

                <SubmitButton
                    icon={action('LOGIN').dispatching ? 'spinner' : 'sign-in'}
                    onClick={() => this.login(form.values())}
                    disabled={form.hasInvalid() || action('LOGIN').dispatching}
                    tabIndex={3}>
                    <Msg id='landing.login.button'/>
                </SubmitButton>

                <ForgotPasswordLink tabIndex={4}/>
            </form>)
    }
}

Login.propTypes = {
    form: PropTypes.object,
    inputs: PropTypes.shape({
        username: PropTypes.object,
        password: PropTypes.object,
    }),
    action: PropTypes.func,
    asyncActionBuilder: PropTypes.func
}

export default Login = form(inputs, mapStateToProps)(Login)

