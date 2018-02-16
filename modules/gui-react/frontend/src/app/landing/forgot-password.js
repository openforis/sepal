import React from 'react'
import {connect} from 'react-redux'
import {AnimateUl} from "../../widget/animate"
import {Constraints, Input, managedForm} from 'widget/form'
import Icon from 'widget/icon'
import styles from './forgot-password.module.css'
import Button from './button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'
import Http from "../../http-client";


const requestPasswordReset = (email) =>
    dispatch => {
        console.log('Requesting password reset for ' + email)
        // Http.post('/user/password/reset-request')
        // TODO: Handle errors
    }

const mapDispatchToProps = (dispatch) => ({
    onSubmit: ({email}) => dispatch(requestPasswordReset(email))
})

export const ForgotPassword = connect(null, mapDispatchToProps)(managedForm({
    email: {
        constraints: new Constraints()
            .notBlank('landing.forgot-password.required')
            .email('landing.forgot-password.invalid')
    },
}, ({onSubmit, onCancel, form, inputs: {email}}) => (
    <form style={styles.form}>
        <div>
            <label><Msg id='landing.forgot-password.label'/></label>
            <Input
                input={email}
                placeholder={msg('landing.forgot-password.placeholder')}
                autoFocus='on'
                autoComplete='off'
                tabIndex={1}
                validate='onBlur'
            />
        </div>

        <AnimateUl className={form.errorClass}>
            {form.errors.map((error, i) =>
                <li key={error}>{error}</li>
            )}
        </AnimateUl>

        <Button
            icon='paper-plane-o'
            onSubmit={form.submit}
            disabled={form.hasInvalid()}
            tabIndex={2}
        >
            <Msg id='landing.forgot-password.button'/>
        </Button>

        <LoginLink onClick={onCancel} tabIndex={3}/>
    </form>
)))
export default ForgotPassword
ForgotPassword.propTypes = {
    onCancel: PropTypes.func.isRequired
}

export const LoginLink = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <a
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            tabIndex={tabIndex}>
            <Icon name='undo' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.forgot-password.cancel-link'/>
        </a>
    </div>

export const ForgotPasswordLink = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <a
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            tabIndex={tabIndex}>
            <Icon name='question-circle' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.login.forgot-password-link'/>
        </a>
    </div>

ForgotPasswordLink.propTypes = {
    onClick: PropTypes.func.isRequired,
    tabIndex: PropTypes.number
}