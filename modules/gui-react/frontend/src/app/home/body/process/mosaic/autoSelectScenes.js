import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import React from 'react'
import {Subject} from 'rxjs'
import {map, takeUntil} from 'rxjs/operators'
import {connect} from 'store'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class AutoSelectScenes extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, asyncActionBuilder} = props
        this.recipeActions = new RecipeActions(recipeId)
        this.request$ = new Subject()
        this.request$.subscribe(sceneCount => {
                this.recipeActions.setAutoSelectingScenes('RUNNING').dispatch()
                asyncActionBuilder('AUTO_SELECT_SCENES',
                    this.autoSelectScenes$(sceneCount))
                    .onComplete(() => this.recipeActions.setAutoSelectingScenes(null))
                    .dispatch()
            }
        )
    }

    autoSelectScenes$(sceneCount) {
        return backend.gee.autoSelectScenes$(sceneCount, this.props.recipe).pipe(
            map(scenes =>
                this.recipeActions.setSelectedScenes(scenes)
            ),
            takeUntil(this.request$)
        )
    }

    render() {
        const {action} = this.props
        return (
            <div>
                {action('AUTO_SELECT_SCENES').dispatching
                    ? <MapStatus message={msg('process.mosaic.panel.auto.selecting')}/>
                    : null}
            </div>
        )
    }

    componentDidUpdate() {
        const {recipe: {ui: {autoSelectingScenes, sceneCount}}} = this.props
        if (autoSelectingScenes === 'SUBMITTED')
            this.request$.next(sceneCount)
    }

    componentWillUnmount() {
        this.request$.unsubscribe()
    }
}

export default connect(mapStateToProps)(AutoSelectScenes)