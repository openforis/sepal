import {Button} from 'widget/button'
import {ChangePassword, ChangePasswordButton} from './changePassword'
import {Form, withForm} from 'widget/form/form'
import {GoogleAccount, GoogleAccountButton} from './googleAccount'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser, isGoogleAccount, updateCurrentUserDetails$} from 'user'
import {msg} from 'translate'
import {withActivatable} from 'widget/activation/activatable'
import {withActivators} from 'widget/activation/activator'
import {withSubscriptions} from 'subscription'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import styles from './userDetails.module.css'

const fields = {
    name: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
    organization: new Form.Field(),
    intendedUse: new Form.Field(),
    // .notBlank('user.userDetails.form.intendedUse.required'),
    emailNotificationsEnabled: new Form.Field(),
}

const mapStateToProps = state => {
    const user = currentUser()
    return {
        user,
        values: {
            name: user.name,
            email: user.email,
            organization: user.organization,
            intendedUse: user.intendedUse,
            emailNotificationsEnabled: user.emailNotificationsEnabled
        },
        tasks: state.tasks
    }
}

const hint$ = new Subject()

class _UserDetails extends React.Component {

    updateUserDetails(userDetails) {
        updateCurrentUserDetails$(userDetails).subscribe(
            () => Notifications.success({message: msg('user.userDetails.update.success')}),
            error => Notifications.error({message: msg('user.userDetails.update.error'), error})
        )
    }

    renderPanel() {
        const {inputs: {name, email, organization, intendedUse, emailNotificationsEnabled}} = this.props
        return (
            <React.Fragment>
                <Panel.Header
                    icon='user'
                    title={msg('user.userDetails.title')}
                    label={this.renderConnectionStatus()}
                />
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
                        <Form.Input
                            label={msg('user.userDetails.form.intendedUse.label')}
                            input={intendedUse}
                            spellCheck={false}
                            errorMessage
                            textArea
                            minRows={4}
                        />
                        <Form.Buttons
                            label={msg('user.userDetails.form.emailNotifications.label')}
                            tooltip={msg('user.userDetails.form.emailNotifications.tooltip')}
                            input={emailNotificationsEnabled}
                            multiple={false}
                            options={[{
                                value: true,
                                label: msg('user.userDetails.form.emailNotifications.enabled.label'),
                                tooltip: msg('user.userDetails.form.emailNotifications.enabled.tooltip')
                            }, {
                                value: false,
                                label: msg('user.userDetails.form.emailNotifications.disabled.label'),
                                tooltip: msg('user.userDetails.form.emailNotifications.disabled.tooltip')
                            }]}
                            type='horizontal-nowrap'
                        />
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderExtraButtons()}
                </Form.PanelButtons>
            </React.Fragment>
        )
    }

    renderExtraButtons() {
        const {form} = this.props
        return form.isDirty()
            ? null
            : (
                <React.Fragment>
                    <ChangePasswordButton disabled={form.isDirty()}/>
                    <GoogleAccountButton disabled={form.isDirty()}/>
                </React.Fragment>
            )
    }

    renderConnectionStatus() {
        const connected = isGoogleAccount()
        return (
            <Layout type='horizontal-nowrap' spacing='compact'>
                <Icon name='google' type='brands'/>
                <div className={isGoogleAccount() ? styles.connected : styles.disconnected}>
                    {msg(connected ? 'user.googleAccount.connected.label' : 'user.googleAccount.disconnected.label')}
                </div>
            </Layout>
        )
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                onApply={userDetails => this.updateUserDetails(userDetails)}
                onClose={deactivate}>
                {this.renderPanel()}
            </Form.Panel>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    changePassword: 'allow-then-deactivate',
    googleAccount: 'allow-then-deactivate'
})

const UserDetails = compose(
    _UserDetails,
    withForm({fields, mapStateToProps}),
    withActivatable({id: 'userDetails', policy, alwaysAllow: true})
)

UserDetails.propTypes = {}

class _UserDetailsButton extends React.Component {
    state = {
        hint: false
    }

    isGoogleProjectSelectionRequired() {
        const {user} = this.props
        return isGoogleAccount()
            && !user.googleTokens.projectId
            && !user.googleTokens.legacyProject
    }

    render() {
        return (
            <React.Fragment>
                {this.renderButton()}
                <UserDetails/>
                <ChangePassword/>
                <GoogleAccount/>
            </React.Fragment>
        )
    }

    renderButton() {
        const {className, user: {username}, activator: {activatables: {userDetails}}} = this.props
        const {hint} = this.state
        return userDetails ? (
            <Button
                chromeless
                look='transparent'
                size='large'
                air='less'
                additionalClassName={className}
                icon={isGoogleAccount() ? 'google' : 'user'}
                iconType={isGoogleAccount() ? 'brands' : null}
                label={username}
                disabled={userDetails.active}
                tooltip={msg('home.sections.user.profile')}
                tooltipPlacement='top'
                tooltipDisabled={userDetails.active}
                hint={hint}
                onClick={userDetails.activate}
            />
        ) : null
    }

    componentDidMount() {
        // this.autoTrigger()
        this.initializeHints()
        this.checkGoogleProjectId()
    }

    componentDidUpdate() {
        // this.autoTrigger()
        this.checkGoogleProjectId()
    }

    checkGoogleProjectId() {
        const {activator: {activatables: {googleAccount}}} = this.props
        if (this.isGoogleProjectSelectionRequired()) {
            googleAccount?.activate && googleAccount.activate({mandatory: true})
        }
    }

    autoTrigger() {
        const {user, activator: {activatables: {userDetails}}} = this.props
        const MANDATORY_FIELDS = ['intendedUse']
        if (userDetails) {
            if (_.some(MANDATORY_FIELDS, field => _.isEmpty(user[field]))) {
                userDetails.activate()
            }
        }
    }

    initializeHints() {
        const {addSubscription} = this.props
        addSubscription(
            hint$.subscribe(hint => this.setState({hint}))
        )
    }
}

export const UserDetailsButton = compose(
    _UserDetailsButton,
    connect(() => ({
        user: currentUser()
    })),
    withSubscriptions(),
    withActivators('userDetails', 'googleAccount')
)

UserDetailsButton.propTypes = {}

export const userDetailsHint = visible =>
    hint$.next(visible)
