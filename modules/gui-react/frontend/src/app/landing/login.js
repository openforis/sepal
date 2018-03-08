import React from 'react'
import {dispatch} from 'store'
import {invalidCredentials, login$} from 'user'
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

const props = () => ({
    errors: invalidCredentials() ? {password: msg('landing.login.password.invalid')} : {}
})

function onSubmit({username, password}) {
    dispatch('Logging in', login$(username, password))
}

let Login = ({form, inputs: {username, password}}) =>
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

        <Button
            icon='sign-in'
            onSubmit={form.submit}
            disabled={form.hasInvalid()}
            tabIndex={3}>
            <Msg id='landing.login.button'/>
        </Button>

        <ForgotPasswordLink tabIndex={4}/>
    </form>

export default Login = form({inputs, props, actions: {onSubmit}})(Login)
