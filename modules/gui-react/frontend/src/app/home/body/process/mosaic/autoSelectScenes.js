import {RecipeActions, RecipeEvents, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import React from 'react'
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
        const {recipe, asyncActionBuilder} = props
        this.recipeActions = new RecipeActions(recipe.id)
        const autoSelectScenes$ = RecipeEvents(recipe.id).autoSelectScenes$
        this.subscription = autoSelectScenes$
            .subscribe(sceneCount => {
                    return asyncActionBuilder('AUTO_SELECT_SCENES',
                        this.autoSelectScenes$(sceneCount).pipe(
                            takeUntil(autoSelectScenes$)
                        ))
                        .onComplete(() => this.recipeActions.setAutoSelectingScenes(false))
                        .dispatch()
                }
            )
    }

    autoSelectScenes$(sceneCount) {
        return backend.gee.autoSelectScenes$(sceneCount, this.props.recipe).pipe(
            map(scenes =>
                this.recipeActions.setSelectedScenes(scenes)
            )
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

    componentWillUnmount() {
        this.subscription.unsubscribe()
    }
}

export default connect(mapStateToProps)(AutoSelectScenes)