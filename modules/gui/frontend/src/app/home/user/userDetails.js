import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Field, Input, form} from 'widget/form'
import {closePanel, showChangePassword} from './userProfile'
import {currentUser, loadCurrentUser$, updateCurrentUserDetails$} from 'user'
import {map, switchMap} from 'rxjs/operators'
import {msg} from 'translate'
import Notifications from 'app/notifications'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import React from 'react'
import api from 'api'
import styles from './userDetails.module.css'

const fields = {
    name: new Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Field()
        .notBlank('user.udpateDetails.form.email.required'),
    organization: new Field()
}
const mapStateToProps = () => {
    const user = currentUser()
    return {
        user,
        values: {
            name: user.name,
            email: user.email,
            organization: user.organization
        }
    }
}

class UserDetails extends React.Component {
    useUserGoogleAccount(e) {
        e.preventDefault()
        api.user.getGoogleAccessRequestUrl$(window.location.hostname)
            .subscribe(({url}) => window.location = url)
    }

    useSepalGoogleAccount(e) {
        e.preventDefault()
        this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT',
            api.user.revokeGoogleAccess$().pipe(
                switchMap(() => loadCurrentUser$()),
                map(loadCurrentUser => loadCurrentUser.dispatch())
            )
        )
    }

    updateUserDetails(userDetails) {
        this.props.stream('UPDATE_CURRENT_USER_DETAILS',
            updateCurrentUserDetails$(userDetails),
            () => {
                Notifications.success('user.userDetails.update').dispatch()
                closePanel()
            },
            error => {
                Notifications.caught('user.userDetails.update', null, error).dispatch()
                closePanel()
            }
        )
    }

    cancel() {
        closePanel()
    }

    renderGoogleAccountButton() {
        const {user, form} = this.props
        return user.googleTokens
            ? (
                <Button
                    label={msg('user.userDetails.useSepalGoogleAccount.label')}
                    icon='google'
                    iconType='brands'
                    tooltip={msg('user.userDetails.useSepalGoogleAccount.tooltip')}
                    disabled={form.isDirty()}
                    onClick={e => this.useSepalGoogleAccount(e)}
                />
            ) : (
                <Button
                    label={msg('user.userDetails.useUserGoogleAccount.label')}
                    icon='google'
                    iconType='brands'
                    tooltip={msg('user.userDetails.useUserGoogleAccount.tooltip')}
                    disabled={form.isDirty()}
                    onClick={e => this.useUserGoogleAccount(e)}
                />
            )
    }

    renderPanel() {
        const {form, inputs: {name, email, organization}} = this.props
        return this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT') === 'ACTIVE'
            ? <CenteredProgress title={msg('user.userDetails.switchingToSepalGoogleAccount')}/>
            : <React.Fragment>
                <PanelContent>
                    <Input
                        label={msg('user.userDetails.form.name.label')}
                        autoFocus
                        input={name}
                        spellCheck={false}
                        errorMessage
                    />
                    <Input
                        label={msg('user.userDetails.form.email.label')}
                        input={email}
                        spellCheck={false}
                        errorMessage
                    />
                    <Input
                        label={msg('user.userDetails.form.organization.label')}
                        input={organization}
                        spellCheck={false}
                    />
                    <div className={styles.googleAccount}>
                        <ButtonGroup>
                            {this.renderGoogleAccountButton()}
                        </ButtonGroup>
                    </div>
                </PanelContent>
                <PanelButtons
                    additionalButtons={[{
                        key: 'changePassword',
                        icon: 'key',
                        label: msg('user.changePassword.title'),
                        disabled: form.isDirty(),
                        onClick: () => showChangePassword()
                    }]}/>
            </React.Fragment>
    }

    render() {
        const {form} = this.props
        return (
            <Portal>
                <Panel
                    className={styles.panel}
                    form={form}
                    statePath='userDetails'
                    modal
                    onApply={userDetails => this.updateUserDetails(userDetails)}
                    onCancel={() => this.cancel()}>
                    <PanelHeader
                        icon='user'
                        title={msg('user.userDetails.title')}/>
                    {this.renderPanel()}
                </Panel>
            </Portal>
        )
    }
}

UserDetails.propTypes = {}

export default form({fields, mapStateToProps})(UserDetails)
