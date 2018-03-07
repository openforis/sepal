import React from 'react'
import {login$, resetPassword$, validateToken$} from 'user'
import {query} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Button from './button'
import {Msg, msg} from 'translate'

function componentWillMount() {
    const token = query().token
    this.subscribe('Validated token', validateToken$(token), {
            next:
                (user) => ({values: {username: user.username}}),

            error:
                (error) => console.log('Token is invalid:', error)
        }
    )
}

function onSubmit({username, password}) {
    const token = query().token
    console.log('token, username, password: ', token, username, password)
    this.subscribe('Reset password', resetPassword$(token, password),
        () => this.subscribe('Logged in', login$(username, password),
            (user) => {
                console.log('reset password')
                // currentUser$.next(user)
                // history().replace('/')
            }
        )
    )

    // this.subscribe('Reset password and logged in',
    //     resetPassword$(token, password)
    //         .map(() => login$(username, password)),
    //     () => history().replace('/')
    // )
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
