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
            loadingRepo: true,
            updatingRepo: false,
            restarting: false,
            buildingAndRestarting: false,
            container: {
                exists: false,
                status: null,
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
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={onClose}>
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
        this.setState({loadingRepo: true})
        
        api.appLauncher.getAppRepoInfo$(app.id).subscribe(
            info => {
                this.setState({
                    loadingRepo: false,
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
                    loadingRepo: false,
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
    
    restartApp() {
        const {app} = this.props
        this.setState({restarting: true, logs: []})
        this.loadContainerStatus()
        
        api.appLauncher.restartApp$(app.id).subscribe(
            response => {
                this.setState({restarting: false})
                this.loadContainerStatus()
                this.loadLogs()
                Notifications.success({message: response.message || msg('apps.admin.restart.success')})
            },
            error => {
                this.setState({restarting: false})
                this.loadContainerStatus()
                Notifications.error({message: error.error || msg('apps.admin.restart.error')})
                log.error('Failed to restart app', error)
            }
        )
    }
    
    buildAndRestartApp() {
        const {app} = this.props
        this.setState({buildingAndRestarting: true, logs: []})
        this.loadContainerStatus()
        
        api.appLauncher.buildAndRestartApp$(app.id).subscribe(
            response => {
                this.setState({buildingAndRestarting: false})
                this.loadContainerStatus()
                this.loadLogs()
                Notifications.success({message: response.message || msg('apps.admin.buildRestart.success')})
            },
            error => {
                this.setState({buildingAndRestarting: false})
                this.loadContainerStatus()
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
                {!logs || logs.length === 0 ? (
                    <div className={styles.row}>
                        <div className={styles.fieldValue}>
                            <span className={styles.statusRow}>
                                {loadingLogs && <Icon name='spinner' className={styles.statusSpinner}/>}
                                <span>{msg('apps.admin.logs.empty')}</span>
                            </span>
                        </div>
                    </div>
                ) : (
                    <div style={{position: 'relative'}}>
                        {loadingLogs && (
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                zIndex: 1,
                                background: 'rgba(255,255,255,0.9)',
                                padding: '4px',
                                borderRadius: '4px'
                            }}>
                                <Icon name='spinner' className={styles.statusSpinner}/>
                            </div>
                        )}
                        <Textarea
                            className={styles.logs}
                            value={logs.join('\n')}
                            readOnly={true}
                            spellCheck={false}
                            minRows={5}
                        />
                    </div>
                )}
            </Widget>
        )
    }

    renderRepoInfo() {
        const {repo, error, loadingRepo} = this.state
        const {url: repoUrl, lastCloneTimestamp, lastCommitId, commitUrl, branch} = repo
        
        return (
            <Widget label={msg('apps.admin.repo.title')} framed labelButtons={this.renderRepositoryButtons()}>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.url')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingRepo && <Icon name='spinner' className={styles.statusSpinner}/>}
                            {repoUrl ? (
                                <a
                                    href={repoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {repoUrl}
                                </a>
                            ) : (
                                <span>{msg('apps.admin.status.loading')}</span>
                            )}
                        </span>
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.branch')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingRepo && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <span>{branch || msg('apps.admin.status.loading')}</span>
                        </span>
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastClone')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingRepo && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <span>
                                {lastCloneTimestamp
                                    ? this.formatTimestamp(lastCloneTimestamp)
                                    : msg('apps.admin.status.loading')
                                }
                            </span>
                        </span>
                    </div>
                </div>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastCommit')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingRepo && <Icon name='spinner' className={styles.statusSpinner}/>}
                            {lastCommitId
                                ? (commitUrl
                                    ? <a
                                        href={commitUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {lastCommitId.substring(0, 7)}
                                    </a>
                                    : <span>{lastCommitId.substring(0, 7)}</span>)
                                : <span>{msg('apps.admin.status.loading')}</span>
                            }
                        </span>
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
            'unhealthy': styles.statusError
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
                            {loadingContainer && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <Icon
                                name='circle'
                                className={statusClass}
                            />
                            <span>
                                {status
                                    ? msg(`apps.admin.status.${status}`)
                                    : msg('apps.admin.status.loading')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.mainProcess')}:</Label>
                    <div className={styles.fieldValue}>
                        <div className={styles.statusRow}>
                            {loadingContainer && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <Icon
                                name='circle'
                                className={healthClass}
                            />
                            <span>
                                {healthStatus
                                    ? msg(`apps.admin.health.${healthStatus}`)
                                    : msg('apps.admin.status.loading')}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.memoryUsage')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingContainer && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <span>
                                {containerStats
                                    ? `${containerStats.memoryUsage} / ${containerStats.memoryLimit} (${containerStats.memoryPercent})`
                                    : msg('apps.admin.status.loading')
                                }
                            </span>
                        </span>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.cpuUsage')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingContainer && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <span>
                                {containerStats
                                    ? containerStats.cpuPercent
                                    : msg('apps.admin.status.loading')
                                }
                            </span>
                        </span>
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>{msg('apps.admin.container.connections')}:</Label>
                    <div className={styles.fieldValue}>
                        <span className={styles.statusRow}>
                            {loadingContainer && <Icon name='spinner' className={styles.statusSpinner}/>}
                            <span>
                                {this.state.resourcez.websockets
                                    ? this.state.resourcez.websockets.open
                                    : msg('apps.admin.status.loading')
                                }
                            </span>
                        </span>
                    </div>
                </div>
            </Widget>
        )
    }

    renderContainerButtons() {
        const {loadingContainer, restarting, buildingAndRestarting} = this.state

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
                icon={restarting ? 'spinner' : 'redo'}
                chromeless
                shape='none'
                tooltip={msg('apps.admin.button.restart')}
                onClick={() => this.restartApp()}
                disabled={restarting}
            />

            <Button
                icon={buildingAndRestarting ? 'spinner' : 'hammer'}
                chromeless
                shape='none'
                tooltip={msg('apps.admin.button.buildRestart')}
                onClick={() => this.buildAndRestartApp()}
                disabled={buildingAndRestarting}
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
