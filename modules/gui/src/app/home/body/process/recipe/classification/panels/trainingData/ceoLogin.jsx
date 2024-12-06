/* eslint-disable no-console */
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
// import {withForm} from '~/widget/form/form'
// import {Panel} from '~/widget/panel/panel'
// import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {msg} from '~/translate'
// import {validateCeoLogin$} from '~/ceo'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

// import {compose} from '~/compose'
import styles from './ceoLogin.module.css'

const fields = {
    email: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    // .match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/, 'user.userDetails.form.email.invalid'),
    password: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
}

// const mapStateToProps = state => ({
//     email: state.ceo.email,
//     password: state.ceo.password,
// })
// const mapStateToProps = () => ({values: {}})

export class _CeoLogin extends React.Component {
    close() {
        
        // const {activator: {activatables: {ceoProjects, ceoLogin}}} = this.props
        const {activatable} = this.props

        // const activator = this.props.activator
        // const activatables = activator.activatables
        // const ceoProjects = activatables.ceoProjects
        // const ceoLogin = activatables.ceoLogin

        activatable.deactivate()

        // ceoProjects.activate()
        
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                isActionForm={true}
                modal
                // onApply={() => this.handleLogin()}
                onApply={values => this.handleLogin(values)}
                onClose={() => this.close()}>
                <Panel.Header
                    icon='key'
                    title={msg('process.classification.panel.trainingData.form.ceo.title')}/>
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )

    }
    
    renderForm() {

        const {inputs} = this.props
        const {email, password} = inputs
    
        // const {email, password} = this.props
        return (
    
            <Layout>
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.email.label')}
                    autoFocus
                    input={email}
                    spellCheck={false}
                />
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.password.label')}
                    input={password}
                    type='password'
                    spellCheck={false}
                />
            </Layout>
        )
    }

    handleLogin(values) {
        console.log('Parameters received in handleLogin:', values)

        const {inputs} = this.props
        // const email = inputs.email.value
        // const password = inputs.password.value
        // Example login logic
        fetch('https://app.collect.earth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({email, password}),
        })
            .then(response => {
                const setCookieHeader = response.xhr.getResponseHeader('set-cookie')
                const cookieParts = setCookieHeader.split(';')
                const ringSessionCookie = cookieParts.find(part => part.startsWith('ring-session='))
                if (ringSessionCookie) {
                    const token = ringSessionCookie.split('=')[1]
                    document.cookie = setCookieHeader
                    console.log('Token:', token)
                    return token
                } else {
                    console.warn('No \'ring-session\' cookie found in the \'set-cookie\' header')
                    throw new Error('No \'ring-session\' cookie found')
                }
            })
            .then(data => {
                if (data.success) {
                // Handle successful login
                } else {
                // Handle login error
                    inputs.password.setError('Invalid email or password.')
                }
            })
            .catch(error => {
                console.error('Error during login:', error)
            })
      
        // Dispatch an action using actionBuilder
        actionBuilder('USER_CEO_LOGIN')
            .set('ceo.login.email', email)
            .set('ceo.login.password', password)
            .dispatch()
    }

}

const policy = () => ({
    _: 'disallow',
})

export const CeoLogin = compose(
    _CeoLogin,
    withForm({fields}),
    withActivators('ceoProjects'),
    withActivatable({id: 'ceoLogin', policy, alwaysAllow: true})
)

class _CeoLoginButton extends React.Component {
    render() {
        console.log('####################### CeoLoginButton props:', this.props)  // Add this line

        // const disabled = this.props.disabled
        const activate = this.props.activator.activatables.ceoLogin.activate
        // const canActivate = this.props.activator.activatables.ceoCredentials.canActivate

        // const {disabled, activator: {activatables: {ceoCredentials: {activate, canActivate}}}} = this.props

        return (
            <Button
                icon={'key'}
                label={msg('user.changePassword.label')}
                disabled={false}
                onClick={activate}/>
        // onClick={() => console.log('Button clicked')}/>
        )
    }
}

export const CeoLoginButton = compose(
    _CeoLoginButton,
    withActivators('ceoLogin'),
    // withActivatable({id: 'ceoProjects'})
)

// CeoLogin.propTypes = {
//     inputs: PropTypes.object.isRequired,
// }

CeoLogin.propTypes = {
    disabled: PropTypes.any
}
