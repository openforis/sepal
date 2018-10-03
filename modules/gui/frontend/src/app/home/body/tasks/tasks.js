import {IconButton} from 'widget/legacyButton'
import {Msg, msg} from 'translate'
import {Progress} from 'widget/progress'
import {connect, select} from 'store'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import React from 'react'
import Tooltip from 'widget/tooltip'
import api from 'api'
import styles from './tasks.module.css'

const mapStateToProps = () => ({
    tasks: select('tasks'),
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
                    <React.Fragment>
                        <Hammer onTap={() => this.restartTask(task)}>
                            <button className={styles.restart}>
                                <Icon name='undo'/>
                                <Msg id='button.restart'/>
                            </button>
                        </Hammer>
                        <Hammer onTap={() => this.removeTask(task)}>
                            <button className={styles.remove}>
                                <Icon name='times'/>
                                <Msg id='button.remove'/>
                            </button>
                        </Hammer>
                    </React.Fragment>
                ) : task.status === 'ACTIVE' ?
                    <Hammer onTap={() => this.stopTask(task)}>
                        <button
                            className={styles.stop}>
                            <Icon name='stop'/>
                            <Msg id='button.stop'/></button>
                    </Hammer>
                    : null}
            </div>
        )
    }

    renderTask(task) {
        return (
            <div key={task.id} className={styles.task}>
                <div className={styles.name}>{task.name}</div>
                <Progress className={styles.progress} status={task.status}/>
                <div className={styles.statusDescription}>{task.statusDescription}</div>
                {this.renderOverlay(task)}
            </div>
        )
    }

    renderToolbar() {
        return (
            <div className={styles.toolbar}>
                <Tooltip msg={msg('tasks.removeAll.tooltip')} bottom>
                    <IconButton
                        icon='times'
                        onClick={() => this.removeAllTasks()}/>
                </Tooltip>

            </div>
        )
    }

    render() {
        const {tasks} = this.state
        return (
            <div className={styles.container}>
                {this.renderToolbar()}
                {tasks.length > 0 ?
                    <div className={styles.tasks}>
                        {tasks.map(task => this.renderTask(task))}
                    </div>
                    : <div className={styles.none}><Msg id='tasks.none'/></div>
                }

            </div>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.tasks !== this.props.tasks)
            this.setState(prevState => ({...prevState, tasks: this.props.tasks}))
    }

    restartTask(task) {
        const {asyncActionBuilder} = this.props
        this.updateTaskInState(task, () => ({
            ...task,
            status: 'PENDING',
            statusDescription: 'Restarting...'
        }))
        asyncActionBuilder('RESTART_TASK',
            api.tasks.restart$(task.id)
        ).dispatch()
    }

    removeTask(task) {
        const {asyncActionBuilder} = this.props
        const {tasks} = this.state
        this.setState(prevState => ({
            ...prevState,
            tasks: tasks.filter(t => t.id !== task.id)
        }))
        asyncActionBuilder('REMOVE_TASK',
            api.tasks.remove$(task.id)
        ).dispatch()
    }

    removeAllTasks() {
        const {asyncActionBuilder} = this.props
        const {tasks} = this.state
        this.setState(prevState => ({
            ...prevState,
            tasks: tasks.filter(t => !['FAILED', 'COMPLETED', 'CANCELED'].includes(t.status))
        }))
        asyncActionBuilder('REMOVE_ALL_TASK',
            api.tasks.removeAll$()
        ).dispatch()
    }

    stopTask(task) {
        const {asyncActionBuilder} = this.props
        this.updateTaskInState(task, () => ({
            ...task,
            status: 'CANCELED',
            statusDescription: 'Stopping...'
        }))
        asyncActionBuilder('STOP_TASK',
            api.tasks.cancel$(task.id)
        ).dispatch()
    }

    updateTaskInState(task, onUpdate) {
        const {tasks} = this.state
        this.setState(prevState => ({
            ...prevState,
            tasks: tasks.map(t =>
                t.id === task.id ? onUpdate() : t)
        }))
    }
}

export default connect(mapStateToProps)(Tasks)
