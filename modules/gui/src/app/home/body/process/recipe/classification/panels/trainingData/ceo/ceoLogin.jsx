import PropTypes from 'prop-types'
import React from 'react'
import {throwError} from 'rxjs'
import {catchError} from 'rxjs/operators'

import {ceoLogin$} from '~/ceo'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './ceoLogin.module.css'

const fields = {
    email: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.ceo.login.email.required')
        .email('process.classification.panel.trainingData.form.ceo.login.email.invalid'),
    password: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.ceo.login.password.required'),
}
export class _CeoLogin extends React.Component {

    constructor() {
        super()
        this.login$ = this.login$.bind(this)
        this.close = this.close.bind(this)
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                isActionForm
                modal
                onApply={this.login$}
                onClose={this.close}>
                <Panel.Header
                    icon='key'
                    title={msg('process.classification.panel.trainingData.form.ceo.login.title')}/>
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.classification.panel.trainingData.form.ceo.login.connect.label')}
                />
            </Form.Panel>
        )
    }
    
    close() {
        const {activatable} = this.props
        activatable.deactivate()
    }

    onEmailChange() {
        const {inputs: {password}} = this.props
        password.setInvalid()
    }
    
    renderForm() {
        const {inputs} = this.props
        const {email, password} = inputs
    
        return (
    
            <Layout>
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.login.email.label')}
                    placeholder={msg('process.classification.panel.trainingData.form.ceo.login.email.placeholder')}
                    tooltip={msg('process.classification.panel.trainingData.form.ceo.login.email.placeholder')}
                    autoFocus
                    input={email}
                    spellCheck={false}
                    onChange={() => this.onEmailChange()}
                />
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.login.password.label')}
                    placeholder={msg('process.classification.panel.trainingData.form.ceo.login.password.placeholder')}
                    input={password}
                    type='password'
                    spellCheck={false}
                />
            </Layout>
        )
    }

    login$(credentials) {
        const {inputs: {password}} = this.props
        return ceoLogin$(credentials).pipe(
            catchError(error => {
                const {status} = error
                if (status === 400) {
                    password.setInvalid(msg('process.classification.panel.trainingData.form.ceo.login.error.invalidCredentials'))
                } else {
                    Notifications.error({
                        title: msg('process.classification.panel.trainingData.form.ceo.login.error.serverTitle'),
                        message: msg('process.classification.panel.trainingData.form.ceo.login.error.serverMessage'),
                        timeout: 0,
                        group: true
                    })
                }
                return throwError(() => error)
            })
        )
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
CeoLogin.propTypes = {
    disabled: PropTypes.any
}
