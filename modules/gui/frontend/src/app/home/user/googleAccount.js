import {EMPTY, throwError} from 'rxjs'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import React from 'react'
import styles from './googleAccount.module.css'
import {currentUser, requestUserAccess$, revokeGoogleAccess$, updateCurrentUserDetails$} from 'widget/user'
import {Button} from 'widget/button'
import SafetyButton from 'widget/safetyButton'
import {connect} from 'store'
import Icon from 'widget/icon'

const mapStateToProps = state => {
    const user = currentUser()
    return {
        user,
        tasks: state.tasks
    }
}

class GoogleAccount extends React.Component {
    useUserGoogleAccount() {
        // e.preventDefault()
        this.props.stream('USE_USER_GOOGLE_ACCOUNT', requestUserAccess$())
    }

    useSepalGoogleAccount() {
        // e.preventDefault()
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
        const {user} = this.props
        const useUserGoogleAccount = this.props.stream('USE_USER_GOOGLE_ACCOUNT')
        return (
            <Button
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.connect.label')}
                look='add'
                width='fill'
                busy={useUserGoogleAccount.active || useUserGoogleAccount.completed}
                onClick={e => this.useUserGoogleAccount(e)}
            />
        )
    }

    renderDisconnectButton() {
        const taskCount = this.getTaskCount()
        return (
            <SafetyButton
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.disconnect.label')}
                message={msg('user.googleAccount.disconnect.warning', {taskCount})}
                width='fill'
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
                <div>
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
                <div>
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
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                isActionForm={true}
                modal
                close={() => this.close()}>
                <Panel.Header
                    icon='key'
                    title={msg('user.googleAccount.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }
}

GoogleAccount.propTypes = {}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate'
})

export default compose(
    GoogleAccount,
    connect(mapStateToProps),
    activator('userDetails'),
    activatable({id: 'googleAccount', policy, alwaysAllow: true})
)
