import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import styles from './changePassword.module.css'
import {Field, ErrorMessage, form, Input} from 'widget/form'
import {changeUserPassword$} from 'user'
import Notifications from 'app/notifications'
import {userDetails} from './userProfile'

const fields = {
    oldPassword: new Field()
        .notBlank('user.changePassword.form.oldPassword.required'),
    newPassword: new Field()
        .notBlank('user.changePassword.form.newPassword.required'),
    confirmPassword: new Field()
        .notBlank('user.changePassword.form.confirmPassword.required')
}

const mapStateToProps = () => ({
    values: {}
})

class ChangePassword extends React.Component {
    changePassword(userPasswords) {
        changeUserPassword$(userPasswords)
            .subscribe(
                () => {
                    Notifications.success('user.changePassword').dispatch()
                    userDetails()
                },
                (error) => Notifications.caught('user.changePassword', null, error).dispatch()
            )       
    }

    cancel() {
        userDetails()
    }

    render() {
        const {form, inputs: {oldPassword, newPassword, confirmPassword}} = this.props
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
                    <PanelHeader
                        icon='user'
                        title={msg('user.changePassword.title')}/>

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
                            <ErrorMessage for={newPassword}/>
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
                </Panel>
            </Portal>
        )
    }
}

ChangePassword.propTypes = {
    open: PropTypes.bool,
    form: PropTypes.object,
    inputs: PropTypes.object
}

export default form({fields, mapStateToProps})(ChangePassword)
