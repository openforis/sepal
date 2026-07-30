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

import {isTaskRunning, mergeTask} from './mergeTask'
import styles from './taskDetails.module.css'
import {updateTimeLabelKey} from './taskLabels'
import {taskStatusDescription} from './taskStatusDescription'

const mapStateToProps = (state, {taskId}) => ({
    projects: select('process.projects'),
    // The live task from the list's Redux state, so an open panel follows status/progress updates.
    liveTask: (state.tasks || []).find(task => task.id === taskId)
})

class _TaskDetails extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            task: null,
            tick: 0
        }
        this.intervalId = null
    }

    componentDidMount() {
        this.loadTaskDetails()
        this.updateTicker()
    }

    componentDidUpdate() {
        // Live status may have changed via Redux - start/stop the duration ticker accordingly.
        this.updateTicker()
    }

    // The full loaded task with live fields (status/statusDescription/updateTime) overlaid from Redux.
    getTask() {
        return mergeTask(this.state.task, this.props.liveTask)
    }

    loadTaskDetails() {
        const {taskId, addSubscription} = this.props

        addSubscription(
            api.tasks.loadDetails$(taskId).subscribe({
                next: task => this.setState({task}),
                error: error => {
                    console.error('Failed to load task details:', error)
                }
            })
        )
    }

    // Re-render every second only while the (merged) task is running, so the live duration keeps counting;
    // once it reaches a terminal state the ticker stops and the duration freezes.
    updateTicker() {
        const running = isTaskRunning(this.getTask())
        if (running && !this.intervalId) {
            this.intervalId = setInterval(() => this.setState(({tick}) => ({tick: tick + 1})), 1000)
        } else if (!running && this.intervalId) {
            this.stopTicker()
        }
    }

    stopTicker() {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
    }

    componentWillUnmount() {
        this.stopTicker()
    }

    calculateDuration(task) {
        if (!task) {
            return '--'
        }
        const start = new Date(task.creationTime).getTime()
        const end = isTaskRunning(task)
            ? Date.now()
            : (task.updateTime ? new Date(task.updateTime).getTime() : Date.now())
        // format.duration renders '--' for a missing creationTime (NaN span), or a negative/non-finite span.
        return format.duration(end - start)
    }
    
    render() {
        const {onClose} = this.props
        const task = this.getTask()

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
                        {this.renderStatus(task)}
                        {this.renderConfiguration(task)}
                        {this.renderLocation(task)}
                        {this.renderProgress(task)}
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

    renderStatus(task) {
        return (
            <Widget label={msg('tasks.details.section.status')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.duration')}/>
                    <div className={styles.fieldValue}>{this.calculateDuration(task)}</div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.creationTime')}/>
                    <div className={styles.fieldValue}>{task.creationTime ? format.fullDateTime(task.creationTime) : '--'}</div>
                </div>

                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg(updateTimeLabelKey(task.status))}/>
                    <div className={styles.fieldValue}>{task.updateTime ? format.fullDateTime(task.updateTime) : '--'}</div>
                </div>
            </Widget>
        )
    }
    
    renderConfiguration(task) {
        const {projects} = this.props
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
    
    renderLocation(task) {
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

    getStatusClass(task) {
        switch (task?.status) {
            case 'PENDING': return styles.pending
            case 'CANCELING': return styles.canceling
            case 'COMPLETED': return styles.completed
            case 'FAILED':
            case 'CANCELED': return styles.failed
            default: return styles.active
        }
    }

    renderProgress(task) {
        if (!task?.status) {
            return null
        }

        const description = taskStatusDescription(task)

        return (
            <Widget label={msg('tasks.details.section.progress')} framed>
                <div className={styles.row}>
                    <Label className={styles.fieldLabel} msg={msg('tasks.details.status')}/>
                    <div className={this.getStatusClass(task)}>
                        {task.status}
                    </div>
                </div>
                {description && (
                    <div className={styles.description}>{description}</div>
                )}
            </Widget>
        )
    }
}

_TaskDetails.propTypes = {
    taskId: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    liveTask: PropTypes.object,
    projects: PropTypes.array
}

export const TaskDetails = compose(
    _TaskDetails,
    connect(mapStateToProps),
    withSubscriptions()
)
