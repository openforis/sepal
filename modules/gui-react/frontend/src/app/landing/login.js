import React from 'react'
import {connect} from 'react-redux'
import {invalidCredentialsProvided, login} from 'user'
import {AnimateUl} from "../../widget/animate"
import {Constraints, Input, managedForm} from 'widget/form'
import {ForgotPasswordLink} from './forgot-password'
import Button from './button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'

const mapStateToProps = (state) => ({
    errors: invalidCredentialsProvided(state) ? {password: msg('landing.login.password.invalid')} : {}
})

const mapDispatchToProps = (dispatch) => ({
    onSubmit: ({username, password}) => dispatch(login(username, password))
})

const Login = connect(mapStateToProps, mapDispatchToProps)(managedForm({
        username: {
            constraints: new Constraints()
                .notBlank('landing.login.username.required')
        },
        password: {
            constraints: new Constraints()
                .notBlank('landing.login.password.required')
        },
    }, ({onForgotPassword, form, inputs: {username, password}}) => (
        <form>
            <div>
                <label><Msg id='landing.login.username.label'/></label>
                <Input
                    input={username}
                    placeholder={msg('landing.login.username.placeholder')}
                    autoFocus='on'
                    autoComplete='off'
                    tabIndex={1}
                    validate='onBlur'
                />
            </div>
            <div>
                <label><Msg id='landing.login.password.label'/></label>
                <Input
                    input={password}
                    type='password'
                    placeholder={msg('landing.login.password.placeholder')}
                    tabIndex={2}
                    validate='onBlur'
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
                tabIndex={3}
            >
                <Msg id='landing.login.button'/>
            </Button>

            <ForgotPasswordLink onClick={onForgotPassword} tabIndex={4}/>
        </form>)
))
Login.propTypes = {
    onForgotPassword: PropTypes.func.isRequired
}
export default Login
