import React from 'react'
import {resetPassword$, validateToken$} from 'user'
import {query} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Button from './button'
import {Msg, msg} from 'translate'
import {dispatch} from 'store'

function componentWillMount() {
    const token = query().token
    dispatch('Validating token', validateToken$(token))
    // TODO: Do something when token is invalid
}

function onSubmit({username, password}) {
    const token = query().token
    dispatch('Resetting password', resetPassword$(token, username, password))
    // TODO: Navigate to /
}

const inputs = {
    username: null,
    password: new Constraints()
        .notBlank('landing.reset-password.password.required'),
    password2: new Constraints()
        .notBlank('landing.reset-password.password2.required')
        .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
}

let ResetPassword = ({form, inputs: {username, password, password2}}) =>
    <form>
        <div>
            <label><Msg id='landing.reset-password.username.label'/></label>
            <Input
                input={username}
                disabled={true}/>
            <ErrorMessage/>
        </div>
        <div>
            <label><Msg id='landing.reset-password.password.label'/></label>
            <Input
                input={password}
                type='password'
                placeholder={msg('landing.reset-password.password.placeholder')}
                autoFocus='on'
                tabIndex={1}/>
            <ErrorMessage input={password}/>
        </div>
        <div>
            <label><Msg id='landing.reset-password.password2.label'/></label>
            <Input
                input={password2}
                type='password'
                placeholder={msg('landing.reset-password.password2.placeholder')}
                tabIndex={2}/>
            <ErrorMessage input={password2}/>
        </div>

        <Button
            icon='sign-in'
            onSubmit={form.submit}
            disabled={form.hasInvalid()}
            tabIndex={3}>
            <Msg id='landing.reset-password.button'/>
        </Button>
    </form>

export default ResetPassword = form({inputs, componentWillMount, actions: {onSubmit}})(ResetPassword)
