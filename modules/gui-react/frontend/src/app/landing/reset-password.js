import React from 'react'
import {resetPassword$, tokenUser, validateToken$} from 'user'
import {history, query} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {SubmitButton} from 'widget/button'
import {Msg, msg} from 'translate'
import Notifications from 'app/notifications'
import {CenteredProgress} from 'widget/progress'
import {PropTypes} from 'prop-types'


const inputs = {
    username: null,
    password: new Constraints()
        .notBlank('landing.reset-password.password.required'),
    password2: new Constraints()
        .notBlank('landing.reset-password.password2.required')
        .predicate((password2, form) => password2 === form.password, 'landing.reset-password.password2.not-matching')
}

const mapStateToProps = () => ({
    user: tokenUser()
})


class ResetPassword extends React.Component {
    componentWillMount() {
        const token = query().token
        this.props.asyncActionBuilder('VALIDATE_TOKEN',
            validateToken$(token))
            .onComplete(([tokenValidated]) => {
                if (!tokenValidated.valid)
                    return [
                        history().push('/'),
                        Notifications.error('landing.validate-token')
                    ]
            })
            .dispatch()
    }

    componentWillReceiveProps(nextProps) {
        const {user, inputs: {username}} = nextProps
        username.set(user && user.username)
    }

    resetPassword({username, password}) {
        const token = query().token
        this.props.asyncActionBuilder('RESET_PASSWORD',
            resetPassword$(token, username, password))
            .onComplete(() => {
                return [
                    history().push('/'),
                    Notifications.success('landing.reset-password')
                ]
            })
            .dispatch()
    }

    render() {
        if (!this.props.action('VALIDATE_TOKEN').dispatched)
            return this.spinner()
        else
            return this.form()
    }

    spinner() {
        return (
            <CenteredProgress title={msg('landing.reset-password.validating-link')}/>
        )
    }

    form() {
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

ResetPassword.propTypes = {
    asyncActionBuilder: PropTypes.func,
    action: PropTypes.func,
    user: PropTypes.object,
    form: PropTypes.object,
    inputs: PropTypes.shape({
        username: PropTypes.string,
        password: PropTypes.string,
        password2: PropTypes.string
    })
}

export default form(inputs, mapStateToProps)(ResetPassword)
