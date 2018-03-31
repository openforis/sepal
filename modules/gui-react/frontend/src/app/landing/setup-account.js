import React from 'react'
import {resetPassword$, validateToken$} from 'user'
import {query} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {SubmitButton} from 'widget/button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'

const inputs = {
    username: null,
    password: new Constraints()
        .notBlank('landing.reset-password.password.required'),
    password2: new Constraints()
        .notBlank('landing.reset-password.password2.required')
        .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
}

class SetupAccount extends React.Component {
    componentWillMount() {
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

            <SubmitButton
                icon='sign-in'
                onClick={() => this.resetPassword(form.values())}
                disabled={form.hasInvalid()}
                tabIndex={3}>
                <Msg id='landing.reset-password.button'/>
            </SubmitButton>
        </form>
    }
}

SetupAccount.propTypes = {
    form: PropTypes.object,
    inputs: PropTypes.shape({
        username: PropTypes.object,
        password: PropTypes.object,
        password2: PropTypes.object
    }),
    action: PropTypes.func,
    asyncActionBuilder: PropTypes.func
}

export default form(inputs)(SetupAccount)
