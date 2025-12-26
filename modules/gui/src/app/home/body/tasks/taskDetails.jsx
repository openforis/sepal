import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {copyToClipboard} from '~/clipboard'
import format from '~/format'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './taskDetails.module.css'

export class TaskDetails extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            task: null,
            duration: null
        }
        this.intervalId = null
    }

    componentDidMount() {
        this.loadTaskDetails()
    }

    loadTaskDetails() {
        const {taskId} = this.props
        
        api.tasks.loadDetails$(taskId).subscribe({
            next: task => {
                this.setState({
                    task,
                    duration: this.calculateDuration(task)
                })
                
                // Set up interval only if task is still running
                if (task.status === 'ACTIVE') {
                    this.intervalId = setInterval(() => {
                        this.setState({duration: this.calculateDuration(task)})
                    }, 1000)
                }
            },
            error: error => {
                // Error is logged but not displayed in UI
                console.error('Failed to load task details:', error)
            }
        })
    }

    componentWillUnmount() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
        }
    }

    calculateDuration(task) {
        const taskData = task || this.state.task
        if (!taskData || !taskData.creationTime) {
            return '--'
        }
        
        const start = new Date(taskData.creationTime)
        const end = taskData.status === 'ACTIVE'
            ? new Date()
            : (taskData.updateTime ? new Date(taskData.updateTime) : new Date())
        
        const durationMs = end - start
        
        // Format duration
        if (durationMs < 0) {
            return '--'
        }
        
        const seconds = Math.floor(durationMs / 1000) % 60
        const minutes = Math.floor(durationMs / (1000 * 60)) % 60
        const hours = Math.floor(durationMs / (1000 * 60 * 60))
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`
        } else {
            return `${seconds}s`
        }
    }
    
    render() {
        const {onClose} = this.props
        const {task} = this.state
        
        if (!task) {
            return null
        }
        
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={onClose}>
                <Panel.Header
                    icon='tasks'
                    title={task.name}
                />
                <Panel.Content scrollable>
                    <Layout type='vertical' spacing='compact'>
                        {this.renderStatus()}
                        {this.renderConfiguration()}
                        {this.renderLocation()}
                        {this.renderProgress()}
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
    
    renderStatus() {
        const {task, duration} = this.state
        
        return (
            <Widget label={msg('tasks.details.section.status')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.status')}/>
                    <div className={styles.fieldValue}>{task.status}</div>
                </div>
                
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.duration')}/>
                    <div className={styles.fieldValue}>{duration}</div>
                </div>
                
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.creationTime')}/>
                    <div className={styles.fieldValue}>{task.creationTime ? format.fullDateTime(task.creationTime) : '--'}</div>
                </div>
                
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.updateTime')}/>
                    <div className={styles.fieldValue}>{task.updateTime ? format.fullDateTime(task.updateTime) : '--'}</div>
                </div>
            </Widget>
        )
    }
    
    renderConfiguration() {
        const {task} = this.state
        const taskInfo = task.params?.taskInfo
        const image = task.params?.image
        const recipe = image?.recipe
        
        if (!recipe?.type && !taskInfo?.recipeType) {
            return null
        }
        
        const recipeType = taskInfo?.recipeType || recipe?.type
        
        return (
            <Widget label={msg('tasks.details.section.conf')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.recipeType')}/>
                    <div className={styles.fieldValue}>{msg(`tasks.details.recipeTypeNames.${recipeType}`)}</div>
                </div>
            </Widget>
        )
    }
    
    renderLocation() {
        const {task} = this.state
        const taskInfo = task.params?.taskInfo
        
        if (task.status === 'FAILED') {
            return null
        }
        
        if (!taskInfo?.destination && !taskInfo?.outputPath) {
            return null
        }
        
        return (
            <Widget label={msg('tasks.details.section.location')} framed>
                {taskInfo?.destination && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.destination.label')}/>
                        <div className={styles.fieldValue}>{msg(`tasks.details.destination.${taskInfo.destination}`)}</div>
                    </div>
                )}
                
                {taskInfo?.destination === 'SEPAL' && taskInfo?.filenamePrefix && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.filenamePrefix')}/>
                        <div className={styles.fieldValue}>{taskInfo.filenamePrefix}</div>
                    </div>
                )}
                
                {taskInfo?.outputPath && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.workspacePath')}/>
                        <div className={styles.fieldValueWithButton}>
                            <div className={styles.fieldValue}>
                                {taskInfo.destination === 'DRIVE' ? `SEPAL/export/${taskInfo.outputPath}` : taskInfo.outputPath}
                            </div>
                            <Button
                                chromeless
                                shape='none'
                                air='none'
                                size='small'
                                icon='copy'
                                tooltip={msg('asset.copyId.tooltip')}
                                tabIndex={-1}
                                onClick={() => copyToClipboard(
                                    taskInfo.destination === 'DRIVE' ? `SEPAL/export/${taskInfo.outputPath}` : taskInfo.outputPath,
                                    msg('asset.copyId.success')
                                )}
                            />
                        </div>
                    </div>
                )}
                
                {taskInfo?.destination === 'GEE' && taskInfo?.sharing && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.sharing.label')}/>
                        <div className={styles.fieldValue}>{msg(`tasks.details.sharing.${taskInfo.sharing}`)}</div>
                    </div>
                )}
            </Widget>
        )
    }
    
    renderProgress() {
        const {description} = this.props
        
        if (!description) {
            return null
        }
        
        return (
            <Widget label={msg('tasks.details.section.progress')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.status')}/>
                    <div className={styles.fieldValue}>
                        {description}
                    </div>
                </div>
            </Widget>
        )
    }
}

TaskDetails.propTypes = {
    taskId: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    description: PropTypes.string
}
