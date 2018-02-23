import React from 'react'
import {invalidCredentialsProvided, login} from 'user'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import Button from './button'
import {Msg, msg} from 'translate'

const Login = form({
    mapStateToProps:
        (state) => ({
            errors: invalidCredentialsProvided(state) ? {password: msg('landing.login.password.invalid')} : {}
        }),

    mapDispatchToProps:
        (dispatch) => ({
            onSubmit: ({username, password}) => dispatch(login(username, password))
        }),

    inputs:
        {
            username: new Constraints()
                .notBlank('landing.login.username.required'),
            password: new Constraints()
                .notBlank('landing.login.password.required')
        },

    View:
        ({form, inputs: {username, password}}) => (
            <form>
                <div>
                    <label><Msg id='landing.login.username.label'/></label>
                    <Input
                        input={username}
                        placeholder={msg('landing.login.username.placeholder')}
                        autoFocus='on'
                        autoComplete='off'
                        tabIndex={1}
                        validate='onBlur'/>
                    <ErrorMessage input={username}/>
                </div>
                <div>
                    <label><Msg id='landing.login.password.label'/></label>
                    <Input
                        input={password}
                        type='password'
                        placeholder={msg('landing.login.password.placeholder')}
                        tabIndex={2}
                        validate='onBlur'/>
                    <ErrorMessage input={password}/>
                </div>

                <Button
                    icon='sign-in'
                    onSubmit={form.submit}
                    disabled={form.hasInvalid()}
                    tabIndex={3}>
                    <Msg id='landing.login.button'/>
                </Button>

                <ForgotPasswordLink tabIndex={4}/>
            </form>)
})
export default Login
