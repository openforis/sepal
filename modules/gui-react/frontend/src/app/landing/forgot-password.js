import React from 'react'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import Icon from 'widget/icon'
import styles from './forgot-password.module.css'
import Button from './button'
import {Link} from "route"
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'


const requestPasswordReset = (email) => {
    return console.log('Requesting password reset for ' + email);
}

export let ForgotPassword = ({onSubmit, onCancel, form, inputs: {email}}) =>
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
            <ErrorMessage input={email}/>
        </div>

        <Button
            icon='paper-plane-o'
            onSubmit={form.submit}
            disabled={form.hasInvalid()}
            tabIndex={2}>
            <Msg id='landing.forgot-password.button'/>
        </Button>

        <LoginLink onClick={onCancel} tabIndex={3}/>
    </form>

export default ForgotPassword = form(ForgotPassword, {
    selectors:
        () => ({
            errors: {}
        }),

    inputs:
        {
            email: new Constraints()
                .notBlank('landing.forgot-password.required')
                .email('landing.forgot-password.invalid')
        },

    onSubmit:
        ({email}) => requestPasswordReset(email)
})

export const LoginLink = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <Link to='/' tabIndex={tabIndex} onMouseDown={(e) => e.preventDefault()}>
            <Icon name='undo' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.forgot-password.cancel-link'/>
        </Link>
    </div>
LoginLink.propTypes = {
    tabIndex: PropTypes.number
}

export const ForgotPasswordLink = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <Link to='/forgot-password' tabIndex={tabIndex} onMouseDown={(e) => e.preventDefault()}>
            <Icon name='question-circle' className={styles.forgotPasswordIcon}/>
            <Msg id='landing.login.forgot-password-link'/>
        </Link>
    </div>

ForgotPasswordLink.propTypes = {
    tabIndex: PropTypes.number
}