import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {getLogger} from '~/log'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'
import {Textarea} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

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
                updateAvailable: false
            },
            logs: [],
            error: null
        }
    }

    componentDidMount() {
        this.loadStatus()
        this.loadLogs()
        this.statusInterval = setInterval(() => this.loadStatus(), 10000)
    }

    componentWillUnmount() {
        const statusInterval = this.statusInterval
        if (statusInterval) {
            clearInterval(statusInterval)
        }
    }
    
    loadStatus() {
        const {app} = this.props
        api.appLauncher.getAppStatus$(app.id).subscribe(
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
                    repo: {
                        url: info.repo?.url || null,
                        lastCloneTimestamp: info.repo?.lastCloneTimestamp || null,
                        lastCommitId: info.repo?.lastCommitId || null,
                        commitUrl: info.repo?.commitUrl || null,
                        updateAvailable: info.repo?.updateAvailable || false
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
                    error: 'Failed to load status: ' + (error.message || 'Unknown error')
                })
            }
        )
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
    
    restartApp() {
        const {app} = this.props
        this.setState({loadingContainer: true})
        
        api.appLauncher.restartApp$(app.id).subscribe(
            () => {
                this.loadStatus()
                this.loadLogs()
                Notifications.success({message: msg('apps.admin.restart.success')})
            },
            error => {
                this.setState({loadingContainer: false})
                Notifications.error({message: msg('apps.admin.restart.error')})
                log.error('Failed to restart app', error)
            }
        )
    }
    
    updateApp() {
        const {app} = this.props
        this.setState({updatingRepo: true})
        
        api.appLauncher.updateApp$(app.id).subscribe(
            response => {
                this.setState({updatingRepo: false})
                this.loadStatus()
                this.loadLogs()
                if (response.updated) {
                    Notifications.success({message: msg('apps.admin.update.success')})
                } else {
                    Notifications.info({message: msg('apps.admin.update.noChanges')})
                }
            },
            error => {
                this.setState({updatingRepo: false})
                Notifications.error({message: msg('apps.admin.update.error')})
                log.error('Failed to update app', error)
            }
        )
    }
    
    reloadStatus() {
        this.setState({loadingContainer: true})
        this.loadStatus()
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
        const {logs} = this.state
        
        if (!logs || logs.length === 0) {
            return <div>{msg('apps.admin.logs.empty')}</div>
        }
        const logContent = logs.join('\n')
        
        return (
            <div>
                {msg('apps.admin.logs.title')}
                <Textarea
                    className={styles.logs}
                    value={logContent}
                    readOnly={true}
                    spellCheck={false}
                    minRows={5}
                />
            </div>
        )
    }

    renderRepoInfo() {
        const {repo, error} = this.state
        const {url: repoUrl, lastCloneTimestamp, lastCommitId, commitUrl} = repo
        return (
            <div>
                {msg('apps.admin.repo.title')}
                {repoUrl && (
                    <div>
                        {msg('apps.admin.repo.url')}: {<a
                            href={repoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.commitLink}
                        >
                            {repoUrl}
                        </a>}
                    </div>
                )}
                {lastCloneTimestamp && (
                    <div>
                        {msg('apps.admin.repo.lastClone')}: {this.formatTimestamp(lastCloneTimestamp)}
                    </div>
                )}
                {lastCommitId && (
                    <div>
                        {msg('apps.admin.repo.lastCommit')}: {
                            commitUrl
                                ? <a
                                    href={commitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.commitLink}
                                >
                                    {lastCommitId.substring(0, 7)}
                                </a>
                                : lastCommitId.substring(0, 7)
                        }
                    </div>
                )}
                {error && (
                    <div>{error}</div>
                )}
            </div>
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
            return <div>{msg('apps.admin.container.notFound')}</div>
        }
        
        return (
            <div>
                {msg('apps.admin.container.title')}
                <div>
                    <div className={styles.statusRow}>
                        <span>Container status:</span>
                        <Icon
                            name={loadingContainer ? 'spinner' : 'circle'}
                            className={loadingContainer ? styles.statusSpinner : statusClass}
                        />
                        <span>
                            {loadingContainer
                                ? msg('apps.admin.status.checking')
                                : msg(`apps.admin.status.${status}`)}
                        </span>
                    </div>
                </div>

                <div>
                    <div className={styles.statusRow}>
                        <span>Main process:</span>
                        <Icon
                            name={loadingContainer ? 'spinner' : 'circle'}
                            className={loadingContainer ? styles.statusSpinner : healthClass}
                        />
                        <span>
                            {loadingContainer
                                ? msg('apps.admin.status.checking')
                                : msg(`apps.admin.health.${healthStatus}`)}
                        </span>
                    </div>
                </div>

                <div className={styles.statusRow}>
                    <span>Memory usage:</span>
                    {loadingContainer ? (
                        <span className={styles.statsValue}>
                            <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.checking')}
                        </span>
                    ) : containerStats ? (
                        <span className={styles.statsValue}>
                            {containerStats.memoryUsage} / {containerStats.memoryLimit} ({containerStats.memoryPercent})
                        </span>
                    ) : (
                        <span className={styles.statsValue}>
                            {msg('apps.admin.status.notAvailable')}
                        </span>
                    )}
                </div>

                <div className={styles.statusRow}>
                    <span>CPU usage:</span>
                    {loadingContainer ? (
                        <span className={styles.statsValue}>
                            <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.checking')}
                        </span>
                    ) : containerStats ? (
                        <span className={styles.statsValue}>
                            {containerStats.cpuPercent}
                        </span>
                    ) : (
                        <span className={styles.statsValue}>
                            {msg('apps.admin.status.notAvailable')}
                        </span>
                    )}
                </div>

            </div>
        )
    }

    renderControls() {
        const {loadingContainer, loadingLogs, updatingRepo, repo} = this.state

        return (
            <div className={styles.section}>
                {msg('apps.admin.controls')}
                <div>
                    <Layout type='horizontal' >
                        <Button
                            look='default'
                            icon='sync-alt'
                            label={msg('apps.admin.button.reloadStatus')}
                            onClick={() => this.reloadStatus()}
                            disabled={loadingContainer}
                        />
                        <Button
                            look='default'
                            icon='sync'
                            label={msg('apps.admin.button.restart')}
                            onClick={() => this.restartApp()}
                            disabled={loadingContainer}
                        />
                        <Button
                            look='default'
                            icon={updatingRepo ? 'spinner' : 'cloud-download-alt'}
                            label={msg('apps.admin.button.update')}
                            onClick={() => this.updateApp()}
                            disabled={updatingRepo}
                            tooltip={repo.updateAvailable
                                ? msg('apps.admin.update.available')
                                : msg('apps.admin.update.checkForUpdates')}
                        />
                        <Button
                            look='default'
                            size='small'
                            icon='file-alt'
                            label={msg('apps.admin.button.reloadLogs')}
                            onClick={() => this.reloadLogs()}
                            disabled={loadingLogs}
                            style={{marginLeft: '10px'}}
                        />
                    </Layout>
                </div>
            </div>

        )
    }

    render() {
        const {app, onClose} = this.props
        
        return (
            <Panel className={styles.panel}type='modal'>
                <Panel.Header
                    icon='info-circle'
                    title={msg('apps.admin.title', {app: app.id || 'Unknown'})}
                />
                <Panel.Content scrollable>
                    <Layout type='vertical' spacing='none'>
                        <div className={styles.section}>
                            {this.renderContainerInfo()}
                        </div>

                        <div className={styles.section}>
                            {this.renderRepoInfo()}
                        </div>
                        <div className={styles.section}>
                            {this.renderControls()}
                        </div>
                        <div className={styles.section}>
                            {this.renderLogsView()}
                        </div>
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
}

AppAdmin.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
