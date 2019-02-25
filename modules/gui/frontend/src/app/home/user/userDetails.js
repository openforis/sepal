import {Activator} from 'widget/activation/activator'
import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Field, Input, form} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {activatable} from 'widget/activation/activatable'
import {connect} from 'store'
import {currentUser, loadCurrentUser$, updateCurrentUserDetails$} from 'user'
import {isMobile} from 'widget/userAgent'
import {map, switchMap} from 'rxjs/operators'
import {msg} from 'translate'
import ChangePassword from './changePassword'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Notifications from 'widget/notifications'
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

class _UserDetails extends React.Component {
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
        updateCurrentUserDetails$(userDetails).subscribe(
            () => Notifications.success({message: msg('user.userDetails.update.success')}),
            error => Notifications.error({message: msg('user.userDetails.update.error'), error})
        )
    }

    cancel() {
        this.closePanel()
    }

    closePanel() {
        const {activatable: {deactivate}} = this.props
        deactivate()
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
                        autoFocus={!isMobile()}
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
                <FormPanelButtons>
                    <Activator id='changePassword'>
                        {({canActivate, activate}) => <Button
                            icon={'key'}
                            label={msg('user.changePassword.title')}
                            disabled={!canActivate || form.isDirty()}
                            onClick={() => activate()}/>
                        }
                    </Activator>
                </FormPanelButtons>
            </React.Fragment>
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                onApply={userDetails => this.updateUserDetails(userDetails)}
                onCancel={() => this.cancel()}
                close={() => deactivate()}>
                <PanelHeader
                    icon='user'
                    title={msg('user.userDetails.title')}/>
                {this.renderPanel()}
            </FormPanel>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    changePassword: 'allow-then-deactivate'
})

const UserDetails = (
    activatable('userDetails', policy)(
        form({fields, mapStateToProps})(
            _UserDetails
        )
    )
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

export const UserDetailsButton = connect(state => ({
    username: state.user.currentUser.username
}))(_UserDetailsButton)

UserDetailsButton.propTypes = {}
