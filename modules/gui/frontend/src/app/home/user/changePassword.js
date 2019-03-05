import {Constraint, Field, Input, form} from 'widget/form'
import {EMPTY, throwError} from 'rxjs'
import {PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {changeUserPassword$} from 'user'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import {switchMap} from 'rxjs/operators'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Notifications from 'widget/notifications'
import React from 'react'
import styles from './changePassword.module.css'

const fields = {
    oldPassword: new Field()
        .notBlank('user.changePassword.form.oldPassword.required'),
    newPassword: new Field()
        .notBlank('user.changePassword.form.newPassword.required')
        .match(/^.{8,100}$/, 'user.changePassword.form.newPassword.invalid'),
    confirmPassword: new Field()
        .notBlank('user.changePassword.form.confirmPassword.required')
}

const constraints = {
    passwordsMatch: new Constraint(['newPassword', 'confirmPassword'])
        .skip(({newPassword, confirmPassword}) => !newPassword || !confirmPassword)
        .predicate(
            ({newPassword, confirmPassword}) => !newPassword || newPassword === confirmPassword,
            'user.changePassword.form.newPassword.notMatching'
        )
}

const mapStateToProps = () => ({values: {}})

class ChangePassword extends React.Component {
    close() {
        const {activator: {activatables: {userDetails}}} = this.props
        userDetails.activate()
    }

    changePassword$(userPasswords) {
        return changeUserPassword$(userPasswords).pipe(
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

    renderPanel() {
        const {inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return <React.Fragment>
            <PanelContent>
                <Input
                    label={msg('user.changePassword.form.oldPassword.label')}
                    type='password'
                    autoFocus={!isMobile()}
                    input={oldPassword}
                    errorMessage
                />
                <Input
                    label={msg('user.changePassword.form.newPassword.label')}
                    type='password'
                    input={newPassword}
                    errorMessage
                />
                <Input
                    label={msg('user.changePassword.form.confirmPassword.label')}
                    type='password'
                    input={confirmPassword}
                    errorMessage={[confirmPassword, 'passwordsMatch']}
                />
            </PanelContent>
            <FormPanelButtons/>
        </React.Fragment>
    }

    render() {
        const {form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                isActionForm={true}
                modal
                // onApply={userPasswords => this.changePassword(userPasswords)}
                onApply={userPasswords => this.changePassword$(userPasswords)}
                close={() => this.close()}>
                <PanelHeader
                    iscon='key'
                    title={msg('user.changePassword.title')}/>
                {this.renderPanel()}
            </FormPanel>
        )
    }
}

ChangePassword.propTypes = {}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate'
})

export default (
    activatable('changePassword', policy)(
        activator(['userDetails'])(
        // activator('foo')(
            form({fields, constraints, mapStateToProps})(
                ChangePassword
            )
        )
    )
)
