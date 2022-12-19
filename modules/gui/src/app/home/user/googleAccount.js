import {Button} from 'widget/button'
import {Layout} from 'widget/layout'
import {ModalConfirmationButton} from 'widget/modalConfirmationButton'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser, requestUserAccess$, revokeGoogleAccess$} from 'user'
import {msg} from 'translate'
import {withActivator} from 'widget/activation/activator'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './googleAccount.module.css'

const mapStateToProps = state => {
    const user = currentUser()
    return {
        user,
        tasks: state.tasks
    }
}

class _GoogleAccount extends React.Component {
    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
    }

    useUserGoogleAccount() {
        this.props.stream('USE_USER_GOOGLE_ACCOUNT', requestUserAccess$())
    }

    useSepalGoogleAccount() {
        this.close()
        this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT',
            revokeGoogleAccess$(),
            () => Notifications.success({message: msg('user.googleAccount.disconnected.success')})
        )
    }

    close() {
        const {activator: {activatables: {userDetails}}} = this.props
        userDetails.activate()
    }

    isUserGoogleAccount() {
        const {user} = this.props
        return user.googleTokens
    }

    getTaskCount() {
        const {tasks} = this.props
        return tasks
            ? tasks.filter(task => task.status === 'ACTIVE').length
            : 0
    }

    renderConnectButton() {
        const useUserGoogleAccount = this.props.stream('USE_USER_GOOGLE_ACCOUNT')
        return (
            <Button
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.connect.label')}
                look='add'
                width='max'
                busy={useUserGoogleAccount.active || useUserGoogleAccount.completed}
                onClick={e => this.useUserGoogleAccount(e)}
            />
        )
    }

    renderDisconnectButton() {
        const taskCount = this.getTaskCount()
        return (
            <ModalConfirmationButton
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.disconnect.label')}
                title={msg('user.googleAccount.disconnect.warning.title')}
                message={msg('user.googleAccount.disconnect.warning.message', {taskCount})}
                width='max'
                skipConfirmation={!taskCount}
                busy={this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT').active}
                onConfirm={() => this.useSepalGoogleAccount()}
            />
        )
    }

    renderConnected() {
        return (
            <Layout type='vertical'>
                <Layout type='horizontal-nowrap' className={styles.connected}>
                    <Icon name='smile' size='2x'/>
                    <div>
                        {msg('user.googleAccount.connected.title')}
                    </div>
                </Layout>
                <div className={styles.info}>
                    {msg('user.googleAccount.connected.info')}
                </div>
                {this.renderDisconnectButton()}
            </Layout>
        )
    }

    renderDisconnected() {
        return (
            <Layout type='vertical'>
                <Layout type='horizontal-nowrap' className={styles.disconnected}>
                    <Icon name='meh' size='2x'/>
                    <div>
                        {msg('user.googleAccount.disconnected.title')}
                    </div>
                </Layout>
                <div className={styles.info}>
                    {msg('user.googleAccount.disconnected.info')}
                </div>
                {this.renderConnectButton()}
            </Layout>
        )
    }

    renderContent() {
        return this.isUserGoogleAccount()
            ? this.renderConnected()
            : this.renderDisconnected()
    }

    render() {
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='key'
                    title={msg('user.googleAccount.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding='Escape'
                            onClick={this.close}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate'
})

export const GoogleAccount = compose(
    _GoogleAccount,
    connect(mapStateToProps),
    withActivator('userDetails'),
    activatable({id: 'googleAccount', policy, alwaysAllow: true})
)

GoogleAccount.propTypes = {}

class _GoogleAccountButton extends React.Component {
    render() {
        const {disabled, activator: {activatables: {googleAccount: {activate, canActivate}}}} = this.props
        return (
            <Button
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.label')}
                disabled={!canActivate || disabled}
                onClick={activate}/>
        )
    }
}

export const GoogleAccountButton = compose(
    _GoogleAccountButton,
    withActivator('googleAccount')
)

GoogleAccountButton.propTypes = {
    disabled: PropTypes.any,
}
