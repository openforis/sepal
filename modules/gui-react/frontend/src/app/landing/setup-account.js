import React from 'react'
import {connect} from 'react-redux'
import {AnimateUl} from "../../widget/animate"
import {Constraints, Input, managedForm} from 'widget/form'
import Button from './button'
import {Msg, msg} from 'translate'

// TODO: Validate token and reset password
const setupAccount = (token, password) =>
    dispatch => {
        console.log('Setting up account')
    }

const mapDispatchToProps = (dispatch) => ({
    onSubmit: ({token, password}) => dispatch(setupAccount(token, password)),
    errors: {}
})

const SetupAccount = connect(null, mapDispatchToProps)(managedForm({
    password: {
        constraints: new Constraints()
            .notBlank('landing.reset-password.password.required')
    },
    password2: {
        constraints: new Constraints()
            .notBlank('landing.reset-password.password2.required')
            .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
    }
}, ({onSubmit, onCancel, form, inputs: {username, password, password2}}) => (
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
)))
export default SetupAccount
