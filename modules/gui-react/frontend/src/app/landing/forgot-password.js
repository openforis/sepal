import React from 'react'
import {connect} from 'react-redux'
import {login} from 'user'
import {AnimateUl} from "../../widget/animate"
import {Constraints, Input, managedForm} from 'widget/form'
import Icon from 'widget/icon'
import styles from './forgot-password.module.css'
import Button from './button'
import {Msg, msg} from 'translate'
import PropTypes from 'prop-types'

const mapDispatchToProps = (dispatch) => ({
    onSubmit: ({username, password}) => dispatch(login(username, password))
})

export const ForgotPassword = connect(null, mapDispatchToProps)(managedForm({
    email: {
        constraints: new Constraints()
            .notBlank('landing.forgot-password.required')
            .email('landing.forgot-password.invalid')
    },
}, ({form, inputs: {email}}) => (
    <form style={styles.form}>
        <div>
            <label><Msg id='landing.forgot-password.label'/></label>
            <Input
                input={email}
                placeholder={msg('landing.forgot-password.email-placeholder')}
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
            tabIndex={3}
        >
            <Msg id='landing.forgot-password.button'/>
        </Button>
    </form>
)))
export default ForgotPassword

export const ForgotPasswordLink = ({tabIndex, onClick}) =>
    <div className={styles.forgotPassword}>
        <a
            href='#foo'
            onClick={(e) => {
                console.log(e)
                onClick(e)
            }}
            tabIndex={tabIndex}>
            <Icon
                name='question-circle'
                className={styles.forgotPasswordIcon}
            />
            <Msg id='landing.forgot-password.link'/>
        </a>
    </div>
ForgotPasswordLink.propTypes = {
    onClick: PropTypes.func.isRequired,
    tabIndex: PropTypes.number
}