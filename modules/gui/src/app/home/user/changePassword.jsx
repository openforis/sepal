import PropTypes from 'prop-types'
import React from 'react'
import {EMPTY, switchMap, throwError} from 'rxjs'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {changeCurrentUserPassword$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './changePassword.module.css'

const fields = {
    oldPassword: new Form.Field()
        .notBlank('user.changePassword.form.oldPassword.required'),
    newPassword: new Form.Field()
        .notBlank('user.changePassword.form.newPassword.required')
        .match(/^.{12,100}$/, 'user.changePassword.form.newPassword.invalid'),
    confirmPassword: new Form.Field()
        .notBlank('user.changePassword.form.confirmPassword.required')
}

const constraints = {
    passwordsMatch: new Form.Constraint(['newPassword', 'confirmPassword'])
        .skip(({newPassword, confirmPassword}) => !newPassword || !confirmPassword)
        .predicate(
            ({newPassword, confirmPassword}) => !newPassword || newPassword === confirmPassword,
            'user.changePassword.form.newPassword.notMatching'
        )
}

const mapStateToProps = () => ({values: {}})

class _ChangePassword extends React.Component {
    close() {
        const {activator: {activatables: {userDetails}}} = this.props
        userDetails.activate()
    }

    changePassword$(userPasswords) {
        return changeCurrentUserPassword$(userPasswords).pipe(
            switchMap(({status}) => {
                if (status === 'success') {
                    Notifications.success({message: msg('user.changePassword.success')})
                    return EMPTY
                } else {
                    this.props.inputs.oldPassword.setInvalid(msg('user.changePassword.form.oldPassword.incorrect'))
                    return throwError()
                }
            })
        )
    }

    renderForm() {
        const {inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return (
            <Layout>
                <Form.Input
                    label={msg('user.changePassword.form.oldPassword.label')}
                    type='password'
                    autoFocus
                    input={oldPassword}
                />
                <Form.Input
                    label={msg('user.changePassword.form.newPassword.label')}
                    type='password'
                    input={newPassword}
                />
                <Form.Input
                    label={msg('user.changePassword.form.confirmPassword.label')}
                    type='password'
                    input={confirmPassword}
                    errorMessage={[confirmPassword, 'passwordsMatch']}
                />
            </Layout>
        )
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                isActionForm={true}
                onApply={userPasswords => this.changePassword$(userPasswords)}
                onClose={() => this.close()}>
                <Panel.Header
                    icon='key'
                    title={msg('user.changePassword.title')}/>
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate'
})

export const ChangePassword = compose(
    _ChangePassword,
    withForm({fields, constraints, mapStateToProps}),
    withActivators('userDetails'),
    withActivatable({id: 'changePassword', policy, alwaysAllow: true})
)

ChangePassword.propTypes = {}

class _ChangePasswordButton extends React.Component {
    render() {
        const {disabled, activator: {activatables: {changePassword: {activate, canActivate}}}} = this.props
        return (
            <Button
                icon={'key'}
                label={msg('user.changePassword.label')}
                disabled={!canActivate || disabled}
                onClick={activate}/>
        )
    }
}

export const ChangePasswordButton = compose(
    _ChangePasswordButton,
    withActivators('changePassword')
)

ChangePasswordButton.propTypes = {
    disabled: PropTypes.any
}
