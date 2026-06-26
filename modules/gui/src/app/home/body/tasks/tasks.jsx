import memoizeOne from 'memoize-one'
import React from 'react'

import api from '~/apiRegistry'
import {NO_PROJECT_SYMBOL, PROJECT_RECIPE_SEPARATOR} from '~/app/home/body/process/recipeList/recipeListConstants'
import {copyToClipboard} from '~/clipboard'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {escapeRegExp, simplifyString, splitString} from '~/string'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {InlineConfirmationButton} from '~/widget/inlineConfirmationButton'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Scrollable} from '~/widget/scrollable'
import {SearchBox} from '~/widget/searchBox'
import {Content, SectionLayout, TopBar} from '~/widget/sectionLayout'
import {Shape} from '~/widget/shape'

import {TaskDetails} from './taskDetails'
import styles from './tasks.module.css'

const getHighlightMatcher = memoizeOne(
    highlightValues => highlightValues.length
        ? new RegExp(`(?:${highlightValues.map(escapeRegExp).join('|')})`, 'i')
        : ''
)

const mapStateToProps = state => ({
    tasks: state.tasks,
    projects: state.process?.projects
})

class _Tasks extends React.Component {
    constructor(props) {
        super(props)
        this.renderTask = this.renderTask.bind(this)
        this.showInfo = this.showInfo.bind(this)
        this.closeTaskDetails = this.closeTaskDetails.bind(this)
        this.removeTask = this.removeTask.bind(this)
        this.stopTask = this.stopTask.bind(this)
        this.copyToClipboard = this.copyToClipboard.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.setStatusFilter = this.setStatusFilter.bind(this)
        this.state = {
            tasks: props.tasks || [],
            selectedTask: null,
            filterValue: '',
            filterValues: [],
            highlightValues: [],
            statusFilter: 'ALL'
        }
    }

    getHighlightMatcher() {
        const {highlightValues} = this.state
        return getHighlightMatcher(highlightValues)
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
                onConfirm={e => this.stopTask(task, e)}
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
                onClick={e => {
                    e.stopPropagation()
                    this.copyToClipboard(task)
                }}
                tooltip={msg('tasks.copyToClipboard.tooltip')}
                tooltipPlacement='left'
            />
        ) : null
    }
    
    // Info button removed as clicking on the CrudItem now shows the task details
    
    showInfo(task) {
        this.setState({selectedTask: task})
    }
    
    closeTaskDetails() {
        this.setState({selectedTask: null})
    }

    getStatusIcon(task) {
        const iconMap = {
            PENDING: 'spinner',
            ACTIVE: 'spinner',
            COMPLETED: 'circle-check',
            FAILED: 'circle-xmark',
            CANCELING: 'spinner',
            CANCELED: 'circle-xmark'
        }
        const iconVariantMap = {
            PENDING: 'info',
            ACTIVE: 'info',
            COMPLETED: 'success',
            FAILED: 'error',
            CANCELING: 'normal',
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
            <ListItem
                key={task.id}
                onClick={() => this.showInfo(task)}>
                <CrudItem
                    title={this.getTaskTitle(task)}
                    description={this.getRecipePath(task)}
                    highlight={this.getHighlightMatcher()}
                    icon={icon}
                    iconSize='xl'
                    iconVariant={iconVariant}
                    inlineComponents={[
                        this.renderDuration(task),
                        this.renderStopButton(task),
                        this.renderCopyButton(task)
                    ]}
                    removeTooltip={msg('tasks.remove.tooltip')}
                    removeDisabled={!this.isStopped(task)}
                    onRemove={e => {
                        e.stopPropagation()
                        this.removeTask(task)
                    }}
                />
            </ListItem>
        )
    }

    renderStatusFilter() {
        const {statusFilter} = this.state
        const options = [
            {label: msg('tasks.filter.status.all'), value: 'ALL'},
            {label: msg('tasks.filter.status.active'), value: 'ACTIVE'},
            {label: msg('tasks.filter.status.completed'), value: 'COMPLETED'},
            {label: msg('tasks.filter.status.failed'), value: 'FAILED'}
        ]
        return (
            <Buttons
                chromeless
                layout='horizontal'
                spacing='tight'
                options={options}
                selected={statusFilter}
                onSelect={this.setStatusFilter}
            />
        )
    }

    setStatusFilter(statusFilter) {
        const {statusFilter: prevStatusFilter} = this.state
        this.setState({statusFilter: statusFilter !== prevStatusFilter ? statusFilter : 'ALL'})
    }

    renderSearch() {
        const {filterValue} = this.state
        return (
            <SearchBox
                value={filterValue}
                placeholder={msg('tasks.filter.search.placeholder')}
                onSearchValue={this.setFilter}
            />
        )
    }

    setFilter(filterValue) {
        this.setState({
            filterValue,
            filterValues: splitString(simplifyString(filterValue)),
            highlightValues: splitString(filterValue.trim())
        })
    }

    getFilteredTasks() {
        const {tasks, filterValues, statusFilter} = this.state
        const {projects} = this.props
        const matchers = filterValues.map(v => new RegExp(v, 'i'))
        return tasks.filter(task => {
            if (statusFilter && statusFilter !== 'ALL') {
                const statuses = statusFilter === 'ACTIVE'
                    ? ['ACTIVE', 'PENDING', 'CANCELING']
                    : statusFilter === 'FAILED'
                        ? ['FAILED', 'CANCELED']
                        : [statusFilter]
                if (!statuses.includes(task.status)) {
                    return false
                }
            }
            if (!matchers.length) {
                return true
            }
            const recipeType = task.taskInfo?.recipeType
            const destination = task.taskInfo?.destination
            const projectId = task.taskInfo?.projectId
            const project = projects?.find(({id}) => id === projectId)
            const projectName = project?.name ?? NO_PROJECT_SYMBOL
            const searchable = [
                task.name,
                task.description,
                recipeType && msg(`tasks.details.recipeTypeNames.${recipeType}`),
                destination && msg(`tasks.details.destination.${destination}`),
                projectName
            ].filter(Boolean).join(' ')
            return matchers.every(matcher => matcher.test(simplifyString(searchable)))
        })
    }

    renderTasks() {
        const filteredTasks = this.getFilteredTasks()
        return filteredTasks.length
            ? this.renderTaskList(filteredTasks)
            : this.renderNoTasks()
    }

    renderTaskList(tasks) {
        const itemKey = task => `${task.id}|${this.getHighlightMatcher()}`
        return (
            <FastList
                items={tasks}
                itemKey={itemKey}
                itemRenderer={this.renderTask}
                spacing='tight'
                overflow={50}
            />
        )
    }

    renderNoTasks() {
        return (
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

    renderTaskDetails() {
        const {selectedTask} = this.state
        if (!selectedTask) {
            return null
        }
        
        return (
            <TaskDetails
                taskId={selectedTask.id}
                description={this.getDescription(selectedTask)}
                onClose={this.closeTaskDetails}
            />
        )
    }
    
    renderHeader() {
        return (
            <Layout type='vertical' spacing='compact'>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                </Layout>
                <Layout type='horizontal' spacing='compact' alignment='right'>
                    {this.renderStatusFilter()}
                </Layout>
            </Layout>
        )
    }

    render() {
        return (
            <SectionLayout>
                <TopBar label={msg('home.sections.tasks')}>
                    {this.renderToolbar()}
                </TopBar>
                <Content horizontalPadding verticalPadding menuPadding>
                    <Layout type='vertical' spacing='compact'>
                        <div className={styles.header}>
                            {this.renderHeader()}
                        </div>
                        <Scrollable direction='x'>
                            {this.renderTasks()}
                        </Scrollable>
                    </Layout>
                </Content>
                {this.renderTaskDetails()}
            </SectionLayout>
        )
    }

    getTaskTitle(task) {
        const recipeType = task.taskInfo?.recipeType
        const destination = task.taskInfo?.destination
        if (recipeType && destination) {
            return `${msg(`tasks.details.recipeTypeNames.${recipeType}`)} \u2192 ${msg(`tasks.details.destination.${destination}`)}`
        }
        return task.name
    }

    getRecipePath(task) {
        const {projects} = this.props
        const projectId = task.taskInfo?.projectId
        const project = projects?.find(({id}) => id === projectId)
        const projectName = project?.name ?? NO_PROJECT_SYMBOL
        const recipeName = task.description || task.name
        return [projectName, recipeName].join(PROJECT_RECIPE_SEPARATOR)
    }

    renderDuration(task) {
        if (!task.creationTime) {
            return null
        }
        const start = new Date(task.creationTime)
        const end = this.isRunning(task)
            ? new Date()
            : (task.updateTime ? new Date(task.updateTime) : new Date())
        const minutes = Math.floor((end - start) / (1000 * 60))
        const durationLabel = minutes < 1 ? '< 1m' : `${minutes}m`
        return (
            <Layout key='duration' type='horizontal-nowrap' spacing='none'>
                <div className={styles.duration}>{`${msg('tasks.duration.label')}: ${durationLabel}`}</div>
            </Layout>
        )
    }

    getDescription(task) {
        let description
        try {
            description = JSON.parse(task.statusDescription)
        } catch(_error) {
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
        copyToClipboard(
            JSON.stringify(task, null, '  '),
            msg('tasks.copyToClipboard.success')
        )
    }

    removeTask(task, e) {
        if (e) {
            e.stopPropagation()
        }
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

    stopTask(task, e) {
        if (e) {
            e.stopPropagation()
        }
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

export const Tasks = compose(
    _Tasks,
    connect(mapStateToProps)
)
