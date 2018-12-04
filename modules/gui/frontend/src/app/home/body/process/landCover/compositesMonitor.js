import {RecipeActions, RecipeState, statuses} from './landCoverRecipe'
import {connect, select} from 'store'
import React from 'react'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    const taskId = recipeState('model.compositeTaskId')
    return {
        status: recipeState('model.status'),
        task: select('tasks').find(task => task.id === taskId)
    }
}

class CompositesMonitor extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
        this.update()
    }

    render() {
        return null
    }

    componentDidUpdate() {
        this.update()
    }

    // TODO: Monitor assets while state is not UNINITIALIZED or COMPOSITES_PENDING_CREATION
    // Update ui state with available assets

    // TODO: Monitor primitives and land cover map creation too

    update() {
        const {status, task} = this.props
        if (!task)
            return
        const setTaskStatus = (nextStatus) =>
            status !== nextStatus && this.recipeActions.setStatus(nextStatus).dispatch()
        if (['ACTIVE', 'PENDING'].includes(task.status))
            setTaskStatus(statuses.CREATING_COMPOSITES)
        else if (task.status === 'COMPLETED')
            setTaskStatus(statuses.COMPOSITES_CREATED)
        else if (['CANCELED', 'FAILED'].includes(task.status))
            setTaskStatus(statuses.COMPOSITES_PENDING_CREATION)
    }

}

export default connect(mapStateToProps)(CompositesMonitor)
