import React from 'react'
import {AnimateUl} from 'widget/animate'
import {form, Constraints, Input} from 'widget/form'
import {validateToken, resetPassword} from 'user'
import {getQuery} from 'route'
import Button from './button'
import {Msg, msg} from 'translate'

const SetupAccount = form({
    mapStateToProps:
        (state) => ({
            token: getQuery(state).token
        }),

    mapDispatchToProps:
        (dispatch) => ({
            validateToken: (token) => dispatch(validateToken(token)),
            onSubmit: ({token, password}) => dispatch(resetPassword(token, password))
        }),

    componentWillMount:
        ({validateToken, token}) => validateToken(token),

    inputs:
        {
            password: new Constraints()
                .notBlank('landing.reset-password.password.required'),
            password2: new Constraints()
                .notBlank('landing.reset-password.password2.required')
                .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
        },

    View:
        ({form, inputs: {username, password, password2}}) =>
            <form>
                <div>
                    <label><Msg id='landing.reset-password.username.label'/></label>
                    <input
                        value={username}
                        disabled={true}
                    />
                </div>
                <div>
                    <label><Msg id='landing.reset-password.password.label'/></label>
                    <Input
                        input={password}
                        type='password'
                        placeholder={msg('landing.reset-password.password.placeholder')}
                        autoFocus='on'
                        tabIndex={1}
                    />
                </div>
                <div>
                    <label><Msg id='landing.reset-password.password2.label'/></label>
                    <Input
                        input={password2}
                        type='password'
                        placeholder={msg('landing.reset-password.password2.placeholder')}
                        tabIndex={2}
                    />
                </div>

                <AnimateUl className={form.errorClass}>
                    {form.errors.map((error, i) =>
                        <li key={error}>{error}</li>
                    )}
                </AnimateUl>

                <Button
                    icon='sign-in'
                    onSubmit={form.submit}
                    disabled={form.hasInvalid()}
                    tabIndex={3}>
                    <Msg id='landing.reset-password.button'/>
                </Button>
            </form>
})
export default SetupAccount
