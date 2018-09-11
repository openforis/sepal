import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {Subject} from 'rxjs'
import {connect} from 'store'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'
import React from 'react'
import backend from 'backend'

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
        this.recipeActions = RecipeActions(recipeId)
        this.request$ = new Subject()
        this.request$.subscribe(() => {
            this.recipeActions.setAutoSelectScenesState('RUNNING').dispatch()
            asyncActionBuilder('AUTO_SELECT_SCENES',
                this.autoSelectScenes$())
                .onComplete(() => this.recipeActions.setAutoSelectScenesState(null))
                .dispatch()
        }
        )
    }

    autoSelectScenes$() {
        return backend.gee.autoSelectScenes$(this.props.recipe).pipe(
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
        if (this.props.recipe.ui.autoSelectScenesState === 'SUBMITTED')
            this.request$.next()
    }

    componentWillUnmount() {
        this.request$.unsubscribe()
    }
}

export default connect(mapStateToProps)(AutoSelectScenes)
