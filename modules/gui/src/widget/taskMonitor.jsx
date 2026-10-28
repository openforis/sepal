import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {TaskTree} from '~/app/home/body/tasks/taskTree'
import {compose} from '~/compose'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'

const log = getLogger('taskMonitor')

class _TaskMonitor extends React.Component {
    tasks = api.tasks.ws()
    tree = TaskTree.create()

    render() {
        return null
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            this.tasks.downstream$.subscribe({
                next: msg => this.onMessage(msg),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    onMessage({data}) {
        data !== undefined && this.onData(data)
    }

    onData({path, items}) {
        this.tree = TaskTree.updateItem(this.tree, TaskTree.fromStringPath(path), items)
        actionBuilder('UPDATE_TASKS')
            .set('tasks', TaskTree.toTasks(this.tree))
            .dispatch()
    }
}

export const TaskMonitor = compose(
    _TaskMonitor,
    withSubscriptions()
)
