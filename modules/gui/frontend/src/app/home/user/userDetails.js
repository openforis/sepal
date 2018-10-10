import {CenteredProgress} from 'widget/progress'
import {ErrorMessage, Field, Input, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {closePanel, showChangePassword} from './userProfile'
import {currentUser, loadCurrentUser$, updateCurrentUserDetails$} from 'user'
import {map, switchMap} from 'rxjs/operators'
import Notifications from 'app/notifications'
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
            () => Notifications.success('user.userDetails.update').dispatch(),
            error => Notifications.caught('user.userDetails.update', null, error).dispatch()
        )
        closePanel()
    }

    cancel() {
        closePanel()
    }

    renderPanel() {
        const {user, form, inputs: {name, email, organization}} = this.props
        const googleAccountButton = user.googleTokens
            ? {
                key: 'useSepalGoogleAccount',
                label: msg('user.userDetails.useSepalGoogleAccount.label'),
                tooltip: msg('user.userDetails.useSepalGoogleAccount.tooltip'),
                disabled: form.isDirty(),
                onClick: e => this.useSepalGoogleAccount(e)
            }
            : {
                key: 'useUserGoogleAccount',
                label: msg('user.userDetails.useUserGoogleAccount.label'),
                tooltip: msg('user.userDetails.useUserGoogleAccount.tooltip'),
                disabled: form.isDirty(),
                onClick: e => this.useUserGoogleAccount(e)
            }
        return this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT') === 'ACTIVE'
            ? <CenteredProgress title={msg('user.userDetails.switchingToSepalGoogleAccount')}/>
            : <React.Fragment>
                <PanelContent>
                    <div>
                        <label><Msg id='user.userDetails.form.name.label'/></label>
                        <Input
                            autoFocus
                            input={name}
                            spellCheck={false}
                        />
                        <ErrorMessage for={name}/>
                    </div>
                    <div>
                        <label><Msg id='user.userDetails.form.email.label'/></label>
                        <Input
                            input={email}
                            spellCheck={false}
                        />
                        <ErrorMessage for={email}/>
                    </div>
                    <div>
                        <label><Msg id='user.userDetails.form.organization.label'/></label>
                        <Input
                            input={organization}
                            spellCheck={false}
                        />
                    </div>
                </PanelContent>
                <PanelButtons
                    form={form}
                    statePath='userDetails'
                    onApply={userDetails => this.updateUserDetails(userDetails)}
                    onCancel={() => this.cancel()}
                    additionalButtons={[{
                        key: 'changePassword',
                        label: msg('user.changePassword.title'),
                        disabled: form.isDirty(),
                        onClick: () => showChangePassword()
                    }, googleAccountButton]}/>
            </React.Fragment>
    }

    render() {
        return (
            <Portal>
                <Panel className={styles.panel} center modal>
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
