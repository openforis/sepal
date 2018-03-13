import React from 'react'
import {invalidCredentials, resetInvalidCredentials, login$} from 'user'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import Button from './button'
import {Msg, msg} from 'translate'

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
        const {form, inputs: {username, password}, dispatching} = this.props
        return <form>
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

            <Button
                icon={dispatching.LOGIN ? 'spinner' : 'sign-in'}
                onSubmit={() => this.login(form.values())}
                disabled={form.hasInvalid() || dispatching.LOGIN}
                tabIndex={3}>
                <Msg id='landing.login.button'/>
            </Button>

            <ForgotPasswordLink tabIndex={4}/>
        </form>
    }
}

export default Login = form(inputs, mapStateToProps)(Login)
