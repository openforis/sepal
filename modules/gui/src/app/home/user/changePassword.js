import {Activator, activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {EMPTY, switchMap, throwError} from 'rxjs'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {changeCurrentUserPassword$} from 'user'
import {compose} from 'compose'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './changePassword.module.css'

const fields = {
    oldPassword: new Form.Field()
        .notBlank('user.changePassword.form.oldPassword.required'),
    newPassword: new Form.Field()
        .notBlank('user.changePassword.form.newPassword.required')
        .match(/^.{8,100}$/, 'user.changePassword.form.newPassword.invalid'),
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
                    errorMessage
                />
                <Form.Input
                    label={msg('user.changePassword.form.newPassword.label')}
                    type='password'
                    input={newPassword}
                    errorMessage
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
                form={form}
                isActionForm={true}
                modal
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
    form({fields, constraints, mapStateToProps}),
    activator('userDetails'),
    activatable({id: 'changePassword', policy, alwaysAllow: true})
)

ChangePassword.propTypes = {}

export const ChangePasswordButton = ({disabled}) => (
    <Activator id='changePassword'>
        {({canActivate, activate}) =>
            <Button
                icon={'key'}
                label={msg('user.changePassword.label')}
                disabled={!canActivate || disabled}
                onClick={() => activate()}/>
        }
    </Activator>
)

ChangePasswordButton.propTypes = {
    disabled: PropTypes.any
}
