import {Button} from 'widget/button'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {CrudItem} from 'widget/crudItem'
import {FastList} from 'widget/fastList'
import {InlineConfirmationButton} from 'widget/inlineConfirmationButton'
import {ListItem} from 'widget/listItem'
import {Shape} from 'widget/shape'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import React from 'react'
import api from 'api'
import clipboard from 'clipboard'
import styles from './tasks.module.css'

const mapStateToProps = state => ({
    tasks: state.tasks,
})

class Tasks extends React.Component {
    constructor(props) {
        super(props)
        this.state = {tasks: props.tasks || []}
    }

    isRunning(task) {
        return ['PENDING', 'ACTIVE'].includes(task.status)
    }

    isStopped(task) {
        return ['FAILED', 'COMPLETED', 'CANCELED'].includes(task.status)
    }

    renderStopButton(task) {
        return this.isRunning(task) ? (
            <InlineConfirmationButton
                key={'stop'}
                chromeless
                shape='circle'
                icon='times'
                onConfirm={() => this.stopTask(task)}
                tooltip={msg('tasks.stop.tooltip')}
                tooltipPlacement='left'
            />
        ) : null
    }

    renderCopyButton(task) {
        return this.isStopped(task) ? (
            <Button
                key={'copy'}
                chromeless
                shape='circle'
                icon='copy'
                onClick={() => this.copyToClipboard(task)}
                tooltip={msg('tasks.copyToClipboard.tooltip')}
                tooltipPlacement='left'
            />
        ) : null
    }

    getStatusIcon(task) {
        const iconMap = {
            PENDING: 'spinner',
            ACTIVE: 'spinner',
            COMPLETED: 'circle-check',
            FAILED: 'circle-xmark',
            CANCELED: 'circle-xmark'
        }
        const iconVariantMap = {
            PENDING: 'info',
            ACTIVE: 'info',
            COMPLETED: 'success',
            FAILED: 'error',
            CANCELED: 'normal'
        }
        return {
            icon: iconMap[task.status],
            iconVariant: iconVariantMap[task.status]
        }
    }

    renderTask(task) {
        const {icon, iconVariant} = this.getStatusIcon(task)
        return (
            <ListItem key={task.id}>
                <CrudItem
                    title={task.name}
                    description={this.getDescription(task)}
                    icon={icon}
                    iconSize='lg'
                    iconVariant={iconVariant}
                    // timestamp={recipe.updateTime}
                    inlineComponents={[
                        this.renderStopButton(task),
                        this.renderCopyButton(task)
                    ]}
                    removeTooltip={msg('tasks.remove.tooltip')}
                    removeDisabled={!this.isStopped(task)}
                    onRemove={() => this.removeTask(task)}
                />
            </ListItem>
        )
    }

    renderTasks() {
        const {tasks} = this.state
        return tasks.length
            ? (
                <FastList
                    items={tasks}
                    itemKey={task => `${task.id}`}
                    spacing='tight'
                    overflow={50}>
                    {task => this.renderTask(task)}
                </FastList>
            )
            : (
                <div className={styles.noTasks}>
                    <Shape
                        look='transparent'
                        shape='pill'
                        size='normal'
                        air='more'>
                        {msg('tasks.none')}
                    </Shape>
                </div>
            )
    }

    renderToolbar() {
        return (
            <InlineConfirmationButton
                chromeless
                shape='circle'
                icon='trash'
                disabled={!this.inactiveTasks().length}
                tooltip={msg('tasks.removeAll.tooltip')}
                tooltipPlacement='bottom'
                onConfirm={() => this.removeAllTasks()}
            />
        )
    }

    render() {
        return (
            <SectionLayout>
                <TopBar label={msg('home.sections.tasks')}>
                    {this.renderToolbar()}
                </TopBar>
                <Content horizontalPadding verticalPadding menuPadding>
                    {this.renderTasks()}
                </Content>
            </SectionLayout>
        )
    }

    getDescription(task) {
        let description
        try {
            description = JSON.parse(task.statusDescription)
        } catch(e) {
            description = task.statusDescription
        }
        if (typeof description === 'string') {
            return description
        } else if (description.messageKey) {
            return msg(description.messageKey, description.messageArgs, description.defaultMessage)
        } else if (description.defaultMessage) {
            return description.defaultMessage
        } else {
            return msg('tasks.status.executing')
        }
    }

    componentDidUpdate(prevProps) {
        const {stream} = this.props
        const notActive = !['REMOVE_TASK', 'REMOVE_ALL_TASKS', 'STOP_TASK']
            .find(action => stream(action).active)
        if (prevProps.tasks !== this.props.tasks && notActive)
            this.setState({tasks: this.props.tasks})
    }

    copyToClipboard(task) {
        clipboard.copy(JSON.stringify(task, null, '  '))
        Notifications.success({message: msg('tasks.copyToClipboard.success')})
    }

    removeTask(task) {
        const {stream} = this.props
        const {tasks} = this.state
        this.setState({
            tasks: tasks.filter(t => t.id !== task.id)
        })
        stream('REMOVE_TASK',
            api.tasks.remove$(task.id)
        )
    }

    removeAllTasks() {
        const {stream} = this.props
        this.setState({tasks: this.activeTasks()})
        stream('REMOVE_ALL_TASK',
            api.tasks.removeAll$()
        )
    }

    activeTasks() {
        const {tasks} = this.state
        return tasks.filter(({status}) => ['PENDING', 'ACTIVE'].includes(status))
    }

    inactiveTasks() {
        const {tasks} = this.state
        return tasks.filter(({status}) => !['PENDING', 'ACTIVE'].includes(status))
    }

    stopTask(task) {
        const {stream} = this.props
        this.updateTaskInState(task, () => ({
            ...task,
            status: 'CANCELED',
            statusDescription: 'Stopping...'
        }))
        stream('STOP_TASK',
            api.tasks.cancel$(task.id)
        )
    }

    updateTaskInState(task, onUpdate) {
        const {tasks} = this.state
        this.setState({
            tasks: tasks.map(t =>
                t.id === task.id ? onUpdate() : t
            )
        })
    }
}

export default compose(
    Tasks,
    connect(mapStateToProps)
)
