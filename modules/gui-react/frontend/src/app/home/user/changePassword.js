import {CenteredProgress} from 'widget/progress'
import {Constraint, ErrorMessage, Field, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {changeUserPassword$} from 'user'
import {userDetails} from './userProfile'
import Notifications from 'app/notifications'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './changePassword.module.css'

const fields = {
    oldPassword: new Field()
        .notBlank('user.changePassword.form.oldPassword.required'),
    newPassword: new Field()
        .notBlank('user.changePassword.form.newPassword.required'),
    confirmPassword: new Field()
        .notBlank('user.changePassword.form.confirmPassword.required')
}

const constraints = {
    passwordsMatch: new Constraint(['newPassword', 'confirmPassword'])
        .predicate(({newPassword, confirmPassword}) =>
            !newPassword || newPassword === confirmPassword,
        'user.changePassword.form.newPassword.notMatching')
}

const mapStateToProps = () => ({
    values: {}
})

class ChangePassword extends React.Component {
    changePassword(userPasswords) {
        this.props.asyncActionBuilder('UPDATE_PASSWORD', changeUserPassword$(userPasswords))
            .onComplete(() => ([
                Notifications.success('user.changePassword')
            ]))
            .onError(() => ([
                Notifications.error('user.changePassword')
            ]))
            .dispatch()
    }

    cancel() {
        userDetails()
    }

    renderPanel() {
        const {form, inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return this.props.action('UPDATE_PASSWORD').dispatching
            ? <CenteredProgress title={msg('user.changePassword.updating')}/>
            : <React.Fragment>
                <PanelContent>
                    <div>
                        <label><Msg id='user.changePassword.form.oldPassword.label'/></label>
                        <Input
                            type='password'
                            autoFocus
                            input={oldPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={oldPassword}/>
                    </div>
                    <div>
                        <label><Msg id='user.changePassword.form.newPassword.label'/></label>
                        <Input
                            type='password'
                            input={newPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={[newPassword, 'passwordsMatch']}/>
                    </div>
                    <div>
                        <label><Msg id='user.changePassword.form.confirmPassword.label'/></label>
                        <Input
                            type='password'
                            input={confirmPassword}
                            spellCheck={false}
                        />
                        <ErrorMessage for={confirmPassword}/>
                    </div>
                </PanelContent>
                <PanelButtons
                    isActionForm={true}
                    form={form}
                    statePath='userPassword'
                    onApply={(userPasswords) => this.changePassword(userPasswords)}
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

ChangePassword.propTypes = {
    asyncActionBuilder: PropTypes.func,
    action: PropTypes.func,
    open: PropTypes.bool,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields, constraints, mapStateToProps})(ChangePassword)
