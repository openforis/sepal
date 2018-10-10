import {Field, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {SubmitButton} from 'widget/legacyButton'
import {query} from 'route'
import {resetPassword$, validateToken$} from 'user'
import React from 'react'

const fields = {
    username: null,
    password: new Field()
        .notBlank('landing.reset-password.password.required'),
    password2: new Field()
        .notBlank('landing.reset-password.password2.required')
        .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
}

class SetupAccount extends React.Component {
    UNSAFE_componentWillMount() {
        const token = query().token
        this.props.asyncActionBuilder('Validating token',
            validateToken$(token))
            .dispatch()
    }

    resetPassword({username, password}) {
        const token = query().token
        this.props.asyncActionBuilder('Reset password',
            resetPassword$(token, username, password))
            .dispatch()
    }

    render() {
        const {form, inputs: {username, password, password2}} = this.props
        return <form>
            <Input
                label={msg('landing.reset-password.username.label')}
                input={username}
                disabled={true}
                errorMessage
            />
            <Input
                label={msg('landing.reset-password.password.label')}
                input={password}
                type='password'
                placeholder={msg('landing.reset-password.password.placeholder')}
                autoFocus='on'
                tabIndex={1}
                errorMessage
            />
            <Input
                label={msg('landing.reset-password.password2.label')}
                input={password2}
                type='password'
                placeholder={msg('landing.reset-password.password2.placeholder')}
                tabIndex={2}
                errorMessage
            />

            <SubmitButton
                icon='sign-in-alt'
                onClick={() => this.resetPassword(form.values())}
                disabled={form.isInvalid()}
                tabIndex={3}>
                <Msg id='landing.reset-password.button'/>
            </SubmitButton>
        </form>
    }
}

SetupAccount.propTypes = {}

export default form({fields})(SetupAccount)
