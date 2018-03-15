import React from 'react'
import {resetPassword$, tokenUser, tokenValid, validateToken$} from 'user'
import {history, query} from 'route'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Button from './button'
import {Msg, msg} from 'translate'
import Notifications from 'app/notifications'
import CenteredPanel from 'widget/centered-panel'
import Icon from 'widget/icon'


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
            <CenteredPanel>
                <div style={{display: 'flex', justifyContent: 'center', fontSize: '2rem'}}>
                    <Icon name='spinner'/>
                </div>
            </CenteredPanel>
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

            <Button
                icon='sign-in'
                onSubmit={() => this.resetPassword(form.values())}
                disabled={form.hasInvalid()}
                tabIndex={3}>
                <Msg id='landing.reset-password.button'/>
            </Button>
        </form>
    }
}

export default ResetPassword = form(inputs, mapStateToProps)(ResetPassword)
