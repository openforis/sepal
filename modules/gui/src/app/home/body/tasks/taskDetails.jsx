import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {NO_PROJECT_SYMBOL} from '~/app/home/body/process/recipeList/recipeListConstants'
import {copyToClipboard} from '~/clipboard'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './taskDetails.module.css'

const mapStateToProps = () => ({
    projects: select('process.projects')
})

class _TaskDetails extends React.Component {
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
        const {taskId, addSubscription} = this.props

        addSubscription(
            api.tasks.loadDetails$(taskId).subscribe({
                next: task => {
                    this.setState({
                        task,
                        duration: this.calculateDuration(task)
                    })

                    // Set up interval only if task is still running
                    if (['ACTIVE', 'PENDING', 'CANCELING'].includes(task.status)) {
                        this.intervalId = setInterval(() => {
                            this.setState({duration: this.calculateDuration(task)})
                        }, 1000)
                    }
                },
                error: error => {
                    console.error('Failed to load task details:', error)
                }
            })
        )
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
        const end = ['ACTIVE', 'PENDING', 'CANCELING'].includes(taskData.status)
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
        const {projects} = this.props
        const {task} = this.state
        const taskInfo = task.params?.taskInfo
        const image = task.params?.image
        const recipe = image?.recipe

        if (!recipe?.type && !taskInfo?.recipeType) {
            return null
        }

        const recipeType = taskInfo?.recipeType || recipe?.type
        const projectId = taskInfo?.projectId
        const project = projects?.find(({id}) => id === projectId)
        const projectName = project?.name ?? NO_PROJECT_SYMBOL
        const recipeName = task.params?.description

        return (
            <Widget label={msg('tasks.details.section.conf')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.recipeType')}/>
                    <div className={styles.fieldValue}>{msg(`tasks.details.recipeTypeNames.${recipeType}`)}</div>
                </div>
                {recipeName && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.origin')}/>
                        <div className={styles.fieldValue}>{`${projectName} / ${recipeName}`}</div>
                    </div>
                )}
            </Widget>
        )
    }
    
    renderLocation() {
        const {task} = this.state
        const taskInfo = task.params?.taskInfo
        
        if (['FAILED', 'CANCELED'].includes(task.status)) {
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
                
                {['SEPAL', 'DRIVE'].includes(taskInfo?.destination) && taskInfo?.filenamePrefix && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={msg('tasks.details.filenamePrefix')}/>
                        <div className={styles.fieldValue}>{taskInfo.filenamePrefix}</div>
                    </div>
                )}
                
                {taskInfo?.outputPath && (
                    <div className={styles.row}>
                        <Label className={styles.fieldLabel} msg={this.getOutputPathLabel(taskInfo)}/>
                        <div className={styles.fieldValueWithButton}>
                            <div className={styles.fieldValue}>
                                {this.formatOutputPath(taskInfo)}
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
                                    this.formatOutputPath(taskInfo),
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
    
    formatOutputPath(taskInfo) {
        switch (taskInfo.destination) {
            case 'SEPAL':
                return `~/${taskInfo.outputPath}`
            case 'DRIVE':
                return `SEPAL/exports/${taskInfo.outputPath}`
            default:
                return taskInfo.outputPath
        }
    }

    getOutputPathLabel(taskInfo) {
        switch (taskInfo.destination) {
            case 'DRIVE': return msg('tasks.details.driveFolder')
            default: return msg('tasks.details.workspacePath')
        }
    }

    getStatusClass() {
        const {task} = this.state
        switch (task?.status) {
            case 'PENDING': return styles.pending
            case 'CANCELING': return styles.canceling
            case 'COMPLETED': return styles.completed
            case 'FAILED':
            case 'CANCELED': return styles.failed
            default: return styles.active
        }
    }

    renderProgress() {
        const {task} = this.state

        if (!task?.status) {
            return null
        }

        return (
            <Widget label={msg('tasks.details.section.progress')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.status')}/>
                    <div className={this.getStatusClass()}>
                        {task.status}
                    </div>
                </div>
            </Widget>
        )
    }
}

_TaskDetails.propTypes = {
    taskId: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    description: PropTypes.string
}

export const TaskDetails = compose(
    _TaskDetails,
    connect(mapStateToProps),
    withSubscriptions()
)
