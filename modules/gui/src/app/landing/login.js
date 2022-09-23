import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {credentialsPosted, invalidCredentials, login$} from 'user'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.login.username.required'),
    password: new Form.Field()
        .notBlank('landing.login.password.required')
}

const mapStateToProps = () => ({
    errors: invalidCredentials() ? {password: msg('landing.login.password.invalid')} : {}
})

class _Login extends React.Component {
    constructor(props) {
        super(props)
        this.submit = this.submit.bind(this)
    }

    render() {
        return (
            <Form
                className={styles.form}
                onSubmit={this.submit}>
                {this.renderForm()}
            </Form>
        )
    }

    renderForm() {
        const {form, inputs: {username, password}, onSignUp, onForgotPassword, stream} = this.props
        return (
            <Layout spacing='loose'>
                <Form.Input
                    label={msg('user.userDetails.form.username.label')}
                    input={username}
                    placeholder={msg('landing.login.username.placeholder')}
                    autoFocus
                    tabIndex={1}
                    errorMessage
                />
                <Form.Input
                    label={msg('user.userDetails.form.password.label')}
                    input={password}
                    type='password'
                    placeholder={msg('landing.login.password.placeholder')}
                    tabIndex={2}
                    errorMessage
                />
                <ButtonGroup layout='horizontal' alignment='fill'>
                    <ButtonGroup layout='horizontal-nowrap' spacing='tight' alignment='spaced'>
                        <Button
                            chromeless
                            look='transparent'
                            size='x-large'
                            shape='pill'
                            label={msg('landing.login.forgot-password-link')}
                            tabIndex={5}
                            onMouseDown={e => e.preventDefault()}
                            onClick={onForgotPassword}
                        />
                        <Button
                            look='add'
                            size='x-large'
                            shape='pill'
                            label={msg('landing.login.sign-up')}
                            tabIndex={4}
                            onMouseDown={e => e.preventDefault()}
                            onClick={onSignUp}
                        />
                    </ButtonGroup>
                    <ButtonGroup layout='horizontal-nowrap' alignment='fill'>
                        <Button
                            type='submit'
                            look='apply'
                            size='x-large'
                            shape='pill'
                            additionalClassName={styles.loginButton}
                            icon={stream('LOGIN').active ? 'spinner' : 'sign-in-alt'}
                            label={msg('landing.login.button')}
                            disabled={form.isInvalid() || stream('LOGIN').active}
                            tabIndex={3}
                        />
                    </ButtonGroup>
                </ButtonGroup>
            </Layout>
        )
    }

    submit() {
        const {form} = this.props
        this.login(form.values())
    }

    login(credentials) {
        const {stream} = this.props
        stream('LOGIN',
            login$(credentials),
            user => {
                credentialsPosted(user)
            },
            () => {
                Notifications.error({message: msg('landing.login.error')})
            }
        )
    }
}

export const Login = compose(
    _Login,
    form({fields, mapStateToProps})
)

Login.propTypes = {
    onForgotPassword: PropTypes.func.isRequired,
    onSignUp: PropTypes.func.isRequired,
    form: PropTypes.object,
    inputs: PropTypes.object
}
