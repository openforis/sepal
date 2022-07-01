import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {invalidCredentials, login$, resetInvalidCredentials} from 'user'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './login.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('landing.login.username.required'),
    password: new Form.Field()
        .notBlank('landing.login.password.required')
}

// const signUp = () => {
//     publishEvent('sign_up')
//     return window.location = 'https://docs.google.com/forms/d/e/1FAIpQLSci4hopXNtMOQKJzsUybaJETrAPQp8j6TCqycSBQ0XO37jBwA/viewform?c=0&w=1'
// }

const mapStateToProps = () => ({
    errors: invalidCredentials() ? {password: msg('landing.login.password.invalid')} : {}
})

class _Login extends React.Component {
    login({username, password}) {
        const {stream} = this.props
        stream('LOGIN', login$({username, password}))
    }

    componentWillUnmount() {
        resetInvalidCredentials()
    }

    render() {
        const {form, inputs: {username, password}, onSignUp, onForgotPassword, stream} = this.props
        return (
            <Form className={styles.form} onSubmit={() => this.login(form.values())}>
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
                        <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                            <Button
                                chromeless
                                look='transparent'
                                size='large'
                                shape='pill'
                                label={msg('landing.login.sign-up')}
                                tabIndex={4}
                                onMouseDown={e => e.preventDefault()}
                                onClick={onSignUp}
                            />
                            <Button
                                chromeless
                                look='transparent'
                                size='large'
                                shape='pill'
                                label={msg('landing.login.forgot-password-link')}
                                tabIndex={5}
                                onMouseDown={e => e.preventDefault()}
                                onClick={onForgotPassword}
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
            </Form>
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
