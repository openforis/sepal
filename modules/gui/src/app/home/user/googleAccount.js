import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {ModalConfirmationButton} from '~/widget/modalConfirmationButton'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {catchError, map, of, tap} from 'rxjs'
import {compose} from '~/compose'
import {googleProjectId, isGoogleAccount, projects$, requestUserAccess$, revokeGoogleAccess$, updateGoogleProject$} from '~/user'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {withForm} from '~/widget/form/form'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './googleAccount.module.css'

const fields = {
    projectId: new Form.Field()
}

const mapStateToProps = () => {
    const projectId = googleProjectId()
    return {
        values: {
            projectId
        }
    }
}

const EARTH_ENGINE_CODE_EDITOR_URL = 'https://code.earthengine.google.com/'

class _GoogleAccount extends React.Component {
    state = {
        projects: null
    }

    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.useUserGoogleAccount = this.useUserGoogleAccount.bind(this)
        this.useSepalGoogleAccount = this.useSepalGoogleAccount.bind(this)
        this.updateProject$ = this.updateProject$.bind(this)
    }

    useUserGoogleAccount() {
        this.props.stream('USE_USER_GOOGLE_ACCOUNT', requestUserAccess$())
    }

    useSepalGoogleAccount() {
        this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT',
            revokeGoogleAccess$(),
            () => {
                Notifications.success({message: msg('user.googleAccount.disconnected.success')})
                this.close()
            }
        )
    }

    disconnectGoogleAccount() {
        this.props.stream('DISCONNECT_GOOGLE_ACCOUNT',
            revokeGoogleAccess$(),
            () => {
                Notifications.warning({
                    message: msg('user.googleAccount.disconnected.projectNeeded'),
                    link: EARTH_ENGINE_CODE_EDITOR_URL,
                    timeout: 0
                })
            }
        )
    }

    close() {
        const {activator: {activatables: {userDetails}}, activatable: {deactivate, mandatory}} = this.props
        if (mandatory) {
            deactivate()
        } else {
            userDetails.activate()
        }
    }

    getTaskCount() {
        const {tasks} = this.props
        return tasks
            ? tasks.filter(task => task.status === 'ACTIVE').length
            : 0
    }

    renderExtraButtons() {
        return isGoogleAccount()
            ? this.renderDisconnectButton()
            : this.renderConnectButton()
    }

    renderConnectButton() {
        const useUserGoogleAccount = this.props.stream('USE_USER_GOOGLE_ACCOUNT')
        return (
            <Button
                icon='google'
                iconType='brands'
                label={msg('user.googleAccount.connect.label')}
                look='add'
                busy={useUserGoogleAccount.active || useUserGoogleAccount.completed}
                onClick={this.useUserGoogleAccount}
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
                skipConfirmation={!taskCount}
                busy={this.props.stream('USE_SEPAL_GOOGLE_ACCOUNT').active}
                onConfirm={this.useSepalGoogleAccount}
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
                {this.renderGoogleProjectSelector()}
                <div className={styles.info}>
                    {msg('user.googleAccount.connected.info')}
                </div>
            </Layout>
        )
    }

    getProjectOptions() {
        const {projects} = this.state
        return projects
            ? projects.map(({projectId, name}) => ({
                label: projectId,
                value: projectId,
                tooltip: name
            }))
            : []
    }

    renderGoogleProjectSelector() {
        const {inputs: {projectId}} = this.props
        const {projects} = this.state
        return (
            <Form.Combo
                input={projectId}
                placeholder={projectId.value}
                label={msg('user.googleAccount.form.projectId.label')}
                options={this.getProjectOptions()}
                className={styles.durationUnit}
                busyMessage={projects === null}
            />
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
            </Layout>
        )
    }

    renderContent() {
        return isGoogleAccount()
            ? this.renderConnected()
            : this.renderDisconnected()
    }

    render() {
        const {form, inputs: {projectId}, activatable: {mandatory}} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                modal
                onApply={this.updateProject$}
                onClose={this.close}>
                <Panel.Header
                    icon='key'
                    title={msg('user.googleAccount.title')}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    disabled={isGoogleAccount() && !projectId.value}
                    disabledCancel={mandatory}>
                    {this.renderExtraButtons()}
                </Form.PanelButtons>
            </Form.Panel>
        )
    }

    updateProject$({projectId}) {
        return updateGoogleProject$(projectId).pipe(
            tap(() => {
                Notifications.success({
                    message: msg('user.googleAccount.form.projectId.updated')
                })
            })
        )
    }

    isValidProjectId(projectId) {
        const {projects} = this.state
        !!projectId && projects?.find(project => project.projectId === projectId)
    }

    componentDidMount() {
        this.loadUserProjects()
    }

    loadUserProjects() {
        const {inputs: {projectId}, stream} = this.props
        if (isGoogleAccount()) {
            stream('LOAD_CLOUD_PROJECTS',
                projects$().pipe(
                    map(projects => projects.filter(({lifecycleState}) => lifecycleState === 'ACTIVE')),
                    catchError(error => {
                        if (projectId.value) {
                            // swallow error for users not having a projectId
                            Notifications.error({message: 'Cannot load Google Projects', error})
                        }
                        return of([])
                    }),
                    tap(projects => this.setUserProjects(projects)),
                    tap(projects => this.disconnectIfNeeded(projects))
                )
            )
        }
    }

    setUserProjects(projects = []) {
        const {inputs: {projectId}} = this.props
        this.setState({projects})
        if (projects.length && !projects.find(project => project.projectId === projectId.value)) {
            projectId.set(projects[0].projectId)
        }
    }

    disconnectIfNeeded(projects) {
        const {stream} = this.props
        if (!googleProjectId() && !projects.length && !stream('DISCONNECT_GOOGLE_ACCOUNT').active) {
            this.disconnectGoogleAccount()
        }
    }
}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate'
})

export const GoogleAccount = compose(
    _GoogleAccount,
    withForm({fields, mapStateToProps}),
    withActivators('userDetails'),
    withActivatable({id: 'googleAccount', policy, alwaysAllow: true})
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
    withActivators('googleAccount')
)

GoogleAccountButton.propTypes = {
    disabled: PropTypes.any,
}
