import {CenteredProgress} from 'widget/progress'
import {Constraint, ErrorMessage, Field, Input, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {changeUserPassword$} from 'user'
import {msg} from 'translate'
import {showUserDetails} from './userProfile'
import Notifications from 'app/notifications'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
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
                    Notifications.success('user.changePassword').dispatch()
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
        const {form, inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return this.props.stream('CHANGE_PASSWORD') === 'ACTIVE'
            ? <CenteredProgress title={msg('user.changePassword.updating')}/>
            : <React.Fragment>
                <PanelContent>
                    <div>
                        <Label msg={msg('user.changePassword.form.oldPassword.label')}/>
                        <Input
                            type='password'
                            autoFocus
                            input={oldPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={oldPassword}/>
                    </div>
                    <div>
                        <Label msg={msg('user.changePassword.form.newPassword.label')}/>
                        <Input
                            type='password'
                            input={newPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={newPassword}/>
                    </div>
                    <div>
                        <Label msg={msg('user.changePassword.form.confirmPassword.label')}/>
                        <Input
                            type='password'
                            input={confirmPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={[confirmPassword, 'passwordsMatch']}/>
                    </div>
                </PanelContent>
                <PanelButtons
                    form={form}
                    isActionForm={true}
                    statePath='userPassword'
                    onApply={userPasswords => this.changePassword(userPasswords)}
                    onCancel={() => this.cancel()}/>
            </React.Fragment>
    }

    render() {
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.changePassword.title')}/>
                    {this.renderPanel()}
                </Panel>
            </Portal>
        )
    }
}

ChangePassword.propTypes = {}

export default form({fields, constraints, mapStateToProps})(ChangePassword)
