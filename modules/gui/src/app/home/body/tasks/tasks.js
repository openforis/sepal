import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {HoverDetector, HoverOverlay} from 'widget/hover'
import {Progress} from 'widget/progress'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Shape} from 'widget/shape'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import React from 'react'
import api from 'api'
import clipboard from 'clipboard'
import look from 'style/look.module.css'
import styles from './tasks.module.css'

const mapStateToProps = state => ({
    tasks: state.tasks,
})

class Tasks extends React.Component {
    constructor(props) {
        super(props)
        this.state = {tasks: props.tasks || []}
    }

    renderOverlay(task) {
        return (
            <div className={styles.overlay}>
                {['FAILED', 'COMPLETED', 'CANCELED'].includes(task.status) ? (
                    <ButtonGroup layout='vertical'>
                        <Button
                            icon='copy'
                            label={msg('button.copyToClipboard')}
                            onClick={() => this.copyToClipboard(task)}/>
                        <Button
                            look={'cancel'}
                            icon='times'
                            label={msg('button.remove')}
                            onClick={() => this.removeTask(task)}/>
                    </ButtonGroup>
                ) : ['PENDING', 'ACTIVE'].includes(task.status) ?
                    <Button
                        className={styles.stop}
                        icon='stop'
                        label={msg('button.stop')}
                        onClick={() => this.stopTask(task)}/>
                    : null}
            </div>
        )
    }

    renderTask(task) {
        return (
            <HoverDetector key={task.id} className={[styles.task, look.look, look.transparent].join(' ')}>
                <div className={styles.name}>{task.name}</div>
                <Progress className={styles.progress} status={task.status}/>
                <div className={styles.statusDescription}>{this.getDescription(task)}</div>
                <HoverOverlay>
                    {this.renderOverlay(task)}
                </HoverOverlay>
            </HoverDetector>
        )
    }

    renderTasks() {
        const {tasks} = this.state
        return tasks.length
            ? (
                <ScrollableContainer>
                    <Scrollable className={styles.tasks}>
                        {tasks.map(task => this.renderTask(task))}
                    </Scrollable>
                </ScrollableContainer>
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
            <div className={styles.toolbar}>
                <Button
                    chromeless
                    size='large'
                    icon='trash'
                    label={msg('tasks.removeAll.label')}
                    tooltip={msg('tasks.removeAll.tooltip')}
                    tooltipPlacement='bottom'
                    disabled={!this.inactiveTasks().length}
                    onClick={() => this.removeAllTasks()}
                />
            </div>
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
