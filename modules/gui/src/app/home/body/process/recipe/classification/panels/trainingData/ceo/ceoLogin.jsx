import PropTypes from 'prop-types'
import React from 'react'
import {throwError} from 'rxjs'
import {catchError, tap} from 'rxjs/operators'

import {ceoLogin$, credentialsPosted,} from '~/ceo'
import {compose} from '~/compose'
import {msg} from '~/translate'
// import {validateCeoLogin$} from '~/ceo'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
// import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

// import {compose} from '~/compose'
import styles from './ceoLogin.module.css'

const fields = {
    email: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.ceo.login.email.required'),
    // .match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/, 'user.userDetails.form.email.invalid'),
    password: new Form.Field()
        .notBlank('process.classification.panel.trainingData.form.ceo.login.password.required'),
}

export class _CeoLogin extends React.Component {

    constructor() {
        super()
        this.onLogin$ = this.onLogin$.bind(this)
    }

    close() {
        
        // const {activator: {activatables: {ceoProjects, ceoLogin}}} = this.props
        const {activatable} = this.props

        activatable.deactivate()
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                applyLabel={'CEO Login'}
                form={form}
                isActionForm
                modal
                onApply={this.onLogin$}
                onClose={() => this.close()}>
                <Panel.Header
                    icon='key'
                    title={msg('process.classification.panel.trainingData.form.ceo.login.title')}/>
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons applyLabel='Connect'/>
            </Form.Panel>
        )

    }
    
    renderForm() {

        const {inputs} = this.props
        const {email, password} = inputs
    
        return (
    
            <Layout>
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.login.email.label')}
                    autoFocus
                    input={email}
                    spellCheck={false}
                />
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.login.password.label')}
                    input={password}
                    type='password'
                    spellCheck={false}
                />
            </Layout>
        )
    }

    onLogin$(credentials) {

        const {email, password} = credentials

        return ceoLogin$(credentials).pipe(
            tap(response => {
                console.info('response', response)
                const statusCode = response.statusCode
                if (statusCode === 401) {
                    password.setInvalid(msg('Email or password is incorrect'))
                } else if (statusCode === 500) {
                    password.setInvalid(msg('there was a server error'))
                } else if (statusCode === 200) {
                    credentialsPosted(response)
                }
            }),
            catchError(error => {
                Notifications.error({message: msg('process.classification.panel.trainingData.form.ceo.login.invalid')})
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
