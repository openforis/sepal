import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {getLogger} from '~/log'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'
import {Textarea} from '~/widget/input'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './appAdmin.module.css'
const log = getLogger('appAdmin')

export class AppAdmin extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            loadingContainer: true,
            loadingLogs: true,
            updatingRepo: false,
            container: {
                exists: false,
                status: 'idle',
                healthStatus: null,
                stats: null,
                clients: null
            },
            repo: {
                url: null,
                lastCloneTimestamp: null,
                lastCommitId: null,
                commitUrl: null,
                updateAvailable: false,
                branch: null
            },
            resourcez: {
                websockets: {
                    open: 0
                }
            },
            logs: [],
            error: null
        }
    }

    render() {
        const {app, onClose} = this.props
        return (
            <Panel className={styles.panel} type='modal'>
                <Panel.Header
                    icon='info-circle'
                    title={msg('apps.admin.title', {app: app.id || 'Unknown'})}
                    label
                />
                <Panel.Content scrollable>
                    <Layout type='vertical' spacing='compact'>
                        {this.renderRepoInfo()}
                        {this.renderContainerInfo()}
                        {this.renderLogsView()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={onClose}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    componentDidMount() {
        this.loadRepoInfo()
        this.loadContainerStatus()
        this.loadLogs()
        this.statusInterval = setInterval(() => this.loadContainerStatus(), 10000)
    }

    componentWillUnmount() {
        const statusInterval = this.statusInterval
        if (statusInterval) {
            clearInterval(statusInterval)
        }
    }
        
    loadLogs() {
        const {app} = this.props
        this.setState({
            loadingLogs: true
        })
        api.appLauncher.getAppLogs$(app.id).subscribe(
            response => {
                this.setState({
                    logs: response.logs || [],
                    loadingLogs: false
                })
            },
            error => {
                this.setState({
                    logs: ['Error: Failed to load logs'],
                    loadingLogs: false
                })
                log.error('Failed to load logs', error)
            }
        )
    }

    loadRepoInfo() {
        const {app} = this.props
        
        api.appLauncher.getAppRepoInfo$(app.id).subscribe(
            info => {
                this.setState({
                    repo: {
                        url: info.repo?.url || null,
                        lastCloneTimestamp: info.repo?.lastCloneTimestamp || null,
                        lastCommitId: info.repo?.lastCommitId || null,
                        commitUrl: info.repo?.commitUrl || null,
                        updateAvailable: info.repo?.updateAvailable || false,
                        branch: info.repo?.branch || null
                    },
                    error: info.error || null
                })
            },
            error => {
                this.setState({
                    error: 'Failed to load repo info: ' + (error.message || 'Unknown error')
                })
                log.error('Failed to load repo info', error)
            }
        )
    }

    loadContainerStatus() {
        const {app} = this.props
        this.setState({
            loadingContainer: true
        })
        
        api.appLauncher.getAppContainerStatus$(app.id).subscribe(
            info => {
                this.setState({
                    loadingContainer: false,
                    container: {
                        exists: !!info.container,
                        status: info.container?.status || 'idle',
                        healthStatus: info.container?.health?.status || null,
                        stats: info.container?.stats || null,
                        clients: info.container?.clients || null
                    },
                    resourcez: {
                        ...this.state.resourcez,
                        websockets: info.resourcez?.websockets || {open: 0}
                    },
                    error: info.error || null
                })
            },
            error => {
                this.setState({
                    loadingContainer: false,
                    container: {
                        ...this.state.container,
                        status: 'error'
                    },
                    error: 'Failed to load container status: ' + (error.message || 'Unknown error')
                })
                Notifications.error({
                    message: error.error
                })
            }
        )
    }

    loadStatus() {
        // Legacy method that loads both repo info and container status
        // Used for backward compatibility when both need to be refreshed
        this.loadRepoInfo()
        this.loadContainerStatus()
    }
    
    restartApp() {
        const {app} = this.props
        this.setState({loadingContainer: true, logs: []})
        
        api.appLauncher.restartApp$(app.id).subscribe(
            response => {
                this.loadContainerStatus()
                this.loadLogs()
                Notifications.success({message: response.message || msg('apps.admin.restart.success')})
            },
            error => {
                this.setState({loadingContainer: false})
                Notifications.error({message: error.error || msg('apps.admin.restart.error')})
                log.error('Failed to restart app', error)
            }
        )
    }
    
    buildAndRestartApp() {
        const {app} = this.props
        this.setState({loadingContainer: true, logs: []})
        
        api.appLauncher.buildAndRestartApp$(app.id).subscribe(
            response => {
                this.loadContainerStatus()
                this.loadLogs()
                Notifications.success({message: response.message || msg('apps.admin.buildRestart.success')})
            },
            error => {
                this.setState({loadingContainer: false})
                Notifications.error({message: error.error || msg('apps.admin.buildRestart.error')})
                log.error('Failed to build and restart app', error)
            }
        )
    }
    
    updateApp() {
        const {app} = this.props
        const {branch} = this.state.repo
        this.setState({updatingRepo: true})
        api.appLauncher.pullUpdatesOnly$(app.id, branch).subscribe(
            response => {
                this.setState({updatingRepo: false})
                this.loadRepoInfo()
                if (response.updated) {
                    Notifications.success({message: response.message || msg('apps.admin.update.success')})
                } else {
                    Notifications.info({message: response.message || msg('apps.admin.update.noChanges')})
                }
            },
            error => {
                this.setState({updatingRepo: false})
                Notifications.error({message: error.error || msg('apps.admin.update.error')})
                log.error('Failed to update app', error)
            }
        )
    }
    
    reloadStatus() {
        this.setState({loadingContainer: true})
        this.loadContainerStatus()
        this.loadLogs()
    }
    
    reloadLogs() {
        this.setState({loadingLogs: true})
        this.loadLogs()
    }

    formatTimestamp(timestamp) {
        if (!timestamp) return msg('apps.admin.timestamp.never')
        const date = new Date(timestamp)
        return date.toLocaleString()
    }

    renderLogsView() {
        const {logs, loadingLogs} = this.state
        
        return (
            <Widget label={msg('apps.admin.logs.title')} framed labelButtons={this.renderLogButton()}>
                {loadingLogs ? (
                    <div className={styles.row}>
                        <div className={styles.fieldValue}>
                            <Icon name='spinner'/> {msg('apps.admin.status.loading')}
                        </div>
                    </div>
                ) : !logs || logs.length === 0 ? (
                    <div className={styles.row}>
                        <div className={styles.fieldValue}>{msg('apps.admin.logs.empty')}</div>
                    </div>
                ) : (
                    <Textarea
                        className={styles.logs}
                        value={logs.join('\n')}
                        readOnly={true}
                        spellCheck={false}
                        minRows={5}
                    />
                )}
            </Widget>
        )
    }

    renderRepoInfo() {
        const {repo, error} = this.state
        const {url: repoUrl, lastCloneTimestamp, lastCommitId, commitUrl, branch} = repo
        
        return (
            <Widget label={msg('apps.admin.repo.title')} framed labelButtons={this.renderRepositoryButtons()}>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.url')}:</Label>
                    <div className={styles.fieldValue}>
                        {repoUrl ? (
                            <a
                                href={repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {repoUrl}
                            </a>
                        ) : (
                            msg('apps.admin.status.loading')
                        )}
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.branch')}:</Label>
                    <div className={styles.fieldValue}>
                        {branch || msg('apps.admin.status.loading')}
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastClone')}:</Label>
                    <div className={styles.fieldValue}>
                        {lastCloneTimestamp
                            ? this.formatTimestamp(lastCloneTimestamp)
                            : msg('apps.admin.status.loading')
                        }
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastCommit')}:</Label>
                    <div className={styles.fieldValue}>
                        {lastCommitId
                            ? (commitUrl
                                ? <a
                                    href={commitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {lastCommitId.substring(0, 7)}
                                </a>
                                : lastCommitId.substring(0, 7))
                            : msg('apps.admin.status.loading')
                        }
                    </div>
                </div>
                {error && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel}>{msg('apps.admin.repo.error')}:</Label>
                        <div className={styles.fieldValue}>{error}</div>
                    </div>
                )}
            </Widget>
        )
    }

    renderContainerInfo() {
        const {container, loadingContainer} = this.state
        const {exists: containerExists, status, healthStatus, stats: containerStats} = container

        const statusClass = {
            'idle': styles.statusIdle,
            'running': styles.statusRunning,
            'error': styles.statusError
        }[status] || styles.statusUnknown

        const healthClass = {
            'healthy': styles.healthHealthy,
            'starting': styles.healthStarting,
        }[healthStatus] || styles.statusUnknown
        
        if (!loadingContainer && !containerExists) {
            return (
                <Widget label={msg('apps.admin.container.title')} framed>
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel}>{msg('apps.admin.container.status')}:</Label>
                        <div className={styles.fieldValue}>{msg('apps.admin.container.notFound')}</div>
                    </div>
                </Widget>
            )
        }
        
        return (
            <Widget label={msg('apps.admin.container.title')} framed labelButtons={this.renderContainerButtons()}>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.containerStatus')}:</Label>
                    <div className={styles.fieldValue}>
                        <div className={styles.statusRow}>
                            <Icon
                                name={loadingContainer ? 'spinner' : 'circle'}
                                className={loadingContainer ? styles.statusSpinner : statusClass}
                            />
                            <span>
                                {loadingContainer
                                    ? msg('apps.admin.status.loading')
                                    : msg(`apps.admin.status.${status}`)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.mainProcess')}:</Label>
                    <div className={styles.fieldValue}>
                        <div className={styles.statusRow}>
                            <Icon
                                name={loadingContainer ? 'spinner' : 'circle'}
                                className={loadingContainer ? styles.statusSpinner : healthClass}
                            />
                            <span>
                                {loadingContainer
                                    ? msg('apps.admin.status.loading')
                                    : msg(`apps.admin.health.${healthStatus}`)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.memoryUsage')}:</Label>
                    <div className={styles.fieldValue}>
                        {loadingContainer ? (
                            <span className={styles.statusRow}>
                                <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.loading')}
                            </span>
                        ) : containerStats ? (
                            <span>
                                {containerStats.memoryUsage} / {containerStats.memoryLimit} ({containerStats.memoryPercent})
                            </span>
                        ) : (
                            <span>
                                {msg('apps.admin.status.loading')}
                            </span>
                        )}
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.cpuUsage')}:</Label>
                    <div className={styles.fieldValue}>
                        {loadingContainer ? (
                            <span className={styles.statusRow}>
                                <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.loading')}
                            </span>
                        ) : containerStats ? (
                            <span>
                                {containerStats.cpuPercent}
                            </span>
                        ) : (
                            <span>
                                {msg('apps.admin.status.loading')}
                            </span>
                        )}
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.connections')}:</Label>
                    <div className={styles.fieldValue}>
                        {loadingContainer ? (
                            <span className={styles.statusRow}>
                                <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.loading')}
                            </span>
                        ) : this.state.resourcez.websockets ? (
                            <span>
                                {this.state.resourcez.websockets.open}
                            </span>
                        ) : (
                            <span>
                                {msg('apps.admin.status.loading')}
                            </span>
                        )}
                    </div>
                </div>
            </Widget>
        )
    }

    renderContainerButtons() {
        const {loadingContainer} = this.state

        return <Layout type='horizontal' spacing='compact'>
            <Button
                icon='sync-alt'
                tooltip={msg('apps.admin.button.reloadStatus')}
                chromeless
                shape='none'
                onClick={() => this.reloadStatus()}
                disabled={loadingContainer}
            />

            <Button
                icon='redo'
                chromeless
                shape='none'
                tooltip={msg('apps.admin.button.restart')}
                onClick={() => this.restartApp()}
                disabled={loadingContainer}
            />

            <Button
                icon='hammer'
                chromeless
                shape='none'
                tooltip={msg('apps.admin.button.buildRestart')}
                onClick={() => this.buildAndRestartApp()}
                disabled={loadingContainer}
            />

        </Layout>
        
    }

    renderRepositoryButtons() {
        const {updatingRepo, repo} = this.state
        return (
            <Layout type='horizontal' spacing='compact'>
                <Button
                    icon={updatingRepo ? 'spinner' : 'cloud-download-alt'}
                    chromeless
                    shape='none'
                    onClick={() => this.updateApp()}
                    disabled={updatingRepo}
                    tooltip={repo.updateAvailable
                        ? msg('apps.admin.update.available')
                        : msg('apps.admin.update.checkForUpdates')}
                />
            </Layout>
        )
    }

    renderLogButton() {
        const {loadingLogs} = this.state
        return (
            <Button
                chromeless
                shape='none'
                icon={loadingLogs ? 'spinner' : 'file-alt'}
                tooltip={msg('apps.admin.button.reloadLogs')}
                onClick={() => this.reloadLogs()}
                disabled={loadingLogs}
            />
        )
    }

}

AppAdmin.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
