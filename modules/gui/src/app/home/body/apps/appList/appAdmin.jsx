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
        const {logs, loadingLogs} = this.state
        
        return (
            <Widget label={msg('apps.admin.logs.title')} framed>
                {loadingLogs ? (
                    <div className={styles.row}>
                        <div className={styles.fieldValue}>
                            <Icon name='spinner'/> {msg('apps.admin.status.checking')}
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
        const {url: repoUrl, lastCloneTimestamp, lastCommitId, commitUrl} = repo
        
        return (
            <Widget label={msg('apps.admin.repo.title')} framed>
                {repoUrl && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel}>{msg('apps.admin.repo.url')}:</Label>
                        <div className={styles.fieldValue}>
                            <a
                                href={repoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {repoUrl}
                            </a>
                        </div>
                    </div>
                )}
                
                {lastCloneTimestamp && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastClone')}:</Label>
                        <div className={styles.fieldValue}>
                            {this.formatTimestamp(lastCloneTimestamp)}
                        </div>
                    </div>
                )}
                
                {lastCommitId && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel}>{msg('apps.admin.repo.lastCommit')}:</Label>
                        <div className={styles.fieldValue}>
                            {commitUrl
                                ? <a
                                    href={commitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {lastCommitId.substring(0, 7)}
                                </a>
                                : lastCommitId.substring(0, 7)
                            }
                        </div>
                    </div>
                )}
                
                {error && (
                    <div className={styles.row}>
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
                        <div className={styles.fieldValue}>{msg('apps.admin.container.notFound')}</div>
                    </div>
                </Widget>
            )
        }
        
        return (
            <Widget label={msg('apps.admin.container.title')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>Container status:</Label>
                    <div className={styles.fieldValue}>
                        <div className={styles.statusRow}>
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
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>Main process:</Label>
                    <div className={styles.fieldValue}>
                        <div className={styles.statusRow}>
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
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>Memory usage:</Label>
                    <div className={styles.fieldValue}>
                        {loadingContainer ? (
                            <span className={styles.statusRow}>
                                <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.checking')}
                            </span>
                        ) : containerStats ? (
                            <span>
                                {containerStats.memoryUsage} / {containerStats.memoryLimit} ({containerStats.memoryPercent})
                            </span>
                        ) : (
                            <span>
                                {msg('apps.admin.status.notAvailable')}
                            </span>
                        )}
                    </div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel}>CPU usage:</Label>
                    <div className={styles.fieldValue}>
                        {loadingContainer ? (
                            <span className={styles.statusRow}>
                                <Icon name='spinner' className={styles.statusSpinner}/> {msg('apps.admin.status.checking')}
                            </span>
                        ) : containerStats ? (
                            <span>
                                {containerStats.cpuPercent}
                            </span>
                        ) : (
                            <span>
                                {msg('apps.admin.status.notAvailable')}
                            </span>
                        )}
                    </div>
                </div>
            </Widget>
        )
    }

    renderControls() {
        const {loadingContainer, loadingLogs, updatingRepo, repo} = this.state

        return (
            <Widget label={msg('apps.admin.controls')} framed>
                <div className={styles.controlsContainer}>
                    <Layout type='horizontal' spacing='compact' alignment='center'>
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
                        />
                    </Layout>
                </div>
            </Widget>
        )
    }

    render() {
        const {app, onClose} = this.props
        
        return (
            <Panel className={styles.panel} type='modal'>
                <Panel.Header
                    icon='info-circle'
                    title={msg('apps.admin.title', {app: app.id || 'Unknown'})}
                />
                <Panel.Content scrollable>
                    <Layout type='vertical' spacing='compact'>
                        {this.renderContainerInfo()}
                        {this.renderRepoInfo()}
                        {this.renderControls()}
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
}

AppAdmin.propTypes = {
    app: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired
}
