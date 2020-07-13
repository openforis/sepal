import {Activator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser, requestUserAccess$, revokeGoogleAccess$, updateCurrentUserDetails$} from 'widget/user'
import {msg} from 'translate'
import ChangePassword from './changePassword'
import Notifications from 'widget/notifications'
import React from 'react'
import SafetyButton from 'widget/safetyButton'
import styles from './userDetails.module.css'

const fields = {
    name: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
    organization: new Form.Field()
}

const mapStateToProps = state => {
    const user = currentUser()
    return {
        user,
        values: {
            name: user.name,
            email: user.email,
            organization: user.organization
        },
        tasks: state.tasks
    }
}

class _UserDetails extends React.Component {

    useUserGoogleAccount() {
        // e.preventDefault()
        this.props.stream('USE_USER_GOOGLE_ACCOUNT', requestUserAccess$())
    }

    useSepalGoogleAccount() {
        // e.preventDefault()
        this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT',
            revokeGoogleAccess$(),
            () => Notifications.success({message: msg('user.userDetails.useSepalGoogleAccount.success')})
        )
    }

    updateUserDetails(userDetails) {
        updateCurrentUserDetails$(userDetails).subscribe(
            () => Notifications.success({message: msg('user.userDetails.update.success')}),
            error => Notifications.error({message: msg('user.userDetails.update.error'), error})
        )
    }

    getTaskCount() {
        const {tasks} = this.props
        return tasks
            ? tasks.filter(task => task.status === 'ACTIVE').length
            : 0
    }

    renderUserGoogleAccountButton() {
        const {form} = this.props
        const useUserGoogleAccount = this.props.stream('USE_USER_GOOGLE_ACCOUNT')
        return (
            <Button
                label={msg('user.userDetails.useUserGoogleAccount.label')}
                icon='google'
                iconType='brands'
                tooltip={msg('user.userDetails.useUserGoogleAccount.tooltip')}
                disabled={form.isDirty()}
                busy={useUserGoogleAccount.active || useUserGoogleAccount.completed}
                onClick={e => this.useUserGoogleAccount(e)}
            />
        )
    }

    renderSepalGoogleAccountButton() {
        const {form} = this.props
        const taskCount = this.getTaskCount()
        return (
            <SafetyButton
                label={msg('user.userDetails.useSepalGoogleAccount.label')}
                icon='google'
                iconType='brands'
                tooltip={msg('user.userDetails.useSepalGoogleAccount.tooltip')}
                message={msg('user.userDetails.useSepalGoogleAccount.warning', {taskCount})}
                disabled={form.isDirty()}
                skipConfirmation={!taskCount}
                busy={this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT').active}
                onConfirm={() => this.useSepalGoogleAccount()}
            />
        )
    }

    renderGoogleAccountButton() {
        const {user} = this.props
        return user.googleTokens
            ? this.renderSepalGoogleAccountButton()
            : this.renderUserGoogleAccountButton()
    }

    renderPanel() {
        const {form, inputs: {name, email, organization}} = this.props
        return (
            <React.Fragment>
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('user.userDetails.form.name.label')}
                            autoFocus
                            input={name}
                            spellCheck={false}
                            errorMessage
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.email.label')}
                            input={email}
                            spellCheck={false}
                            errorMessage
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.organization.label')}
                            input={organization}
                            spellCheck={false}
                        />
                        <div className={styles.googleAccount}>
                            <ButtonGroup>
                                {this.renderGoogleAccountButton()}
                            </ButtonGroup>
                        </div>
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons>
                    <Activator id='changePassword'>
                        {({canActivate, activate}) =>
                            <Button
                                icon={'key'}
                                label={msg('user.changePassword.title')}
                                disabled={!canActivate || form.isDirty()}
                                onClick={() => activate()}/>
                        }
                    </Activator>
                </Form.PanelButtons>
            </React.Fragment>
        )
    }

    // renderProgress() {
    //     return this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT').active
    //         ? <Modal>
    //             <CenteredProgress title={msg('user.userDetails.switchingToSepalGoogleAccount')}/>
    //         </Modal>
    //         : null
    // }

    render() {
        const {form, activatable: {deactivate}} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                onApply={userDetails => this.updateUserDetails(userDetails)}
                close={() => deactivate()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.userDetails.title')}/>
                {this.renderPanel()}
                {/* {this.renderProgress()} */}
            </Form.Panel>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    changePassword: 'allow-then-deactivate'
})

const UserDetails = compose(
    _UserDetails,
    form({fields, mapStateToProps}),
    activatable({id: 'userDetails', policy, alwaysAllow: true})
)

UserDetails.propTypes = {}

const _UserDetailsButton = ({className, username}) =>
    <React.Fragment>
        <Activator id='userDetails'>
            {({active, activate}) =>
                <Button
                    chromeless
                    look='transparent'
                    size='large'
                    air='less'
                    additionalClassName={className}
                    label={username}
                    disabled={active}
                    onClick={() => activate()}
                    tooltip={msg('home.sections.user.profile')}
                    tooltipPlacement='top'
                    tooltipDisabled={active}/>
            }
        </Activator>
        <UserDetails/>
        <ChangePassword/>
    </React.Fragment>

export const UserDetailsButton = compose(
    _UserDetailsButton,
    connect(state => ({
        username: state.user.currentUser.username
    }))
)

UserDetailsButton.propTypes = {}
