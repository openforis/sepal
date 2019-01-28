import {CenteredProgress} from 'widget/progress'
import {Constraint, Field, Input, form} from 'widget/form'
import {changeUserPassword$} from 'user'
import {msg} from 'translate'
import {showUserDetails} from './userProfile'
import Notifications from 'widget/notifications'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
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
    changePassword(userPasswords) {
        this.props.stream('CHANGE_PASSWORD',
            changeUserPassword$(userPasswords),
            ({status}) => {
                if (status === 'success') {
                    Notifications.success({message: msg('user.changePassword.success')})
                    showUserDetails()
                } else
                    this.props.inputs.oldPassword.setInvalid(msg('user.changePassword.form.oldPassword.incorrect'))
            }
        )
    }

    cancel() {
        showUserDetails()
    }

    renderPanel() {
        const {inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return this.props.stream('CHANGE_PASSWORD') === 'ACTIVE'
            ? <CenteredProgress title={msg('user.changePassword.updating')}/>
            : <React.Fragment>
                <PanelContent>
                    <Input
                        label={msg('user.changePassword.form.oldPassword.label')}
                        type='password'
                        autoFocus
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
                <PanelButtons/>
            </React.Fragment>
    }

    render() {
        const {form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                isActionForm={true}
                statePath='userPassword'
                modal
                onApply={userPasswords => this.changePassword(userPasswords)}
                onCancel={() => this.cancel()}>
                <PanelHeader
                    icon='key'
                    title={msg('user.changePassword.title')}/>
                {this.renderPanel()}
            </Panel>
        )
    }
}

ChangePassword.propTypes = {}

export default form({fields, constraints, mapStateToProps})(ChangePassword)
