import {MapStatus} from '~/widget/mapStatus'
import {RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {Subject, takeUntil} from 'rxjs'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'
import api from '~/apiRegistry'

const mapRecipeToProps = recipe => ({recipe})

class _AutoSelectScenes extends React.Component {
    constructor(props) {
        super(props)
        const {recipe} = props
        this.recipeActions = RecipeActions(recipe.id)
        this.request$ = new Subject()
    }

    autoSelectScenes$() {
        const recipe = this.props.recipe
        return api.gee.autoSelectScenes$({
            sceneAreaIds: recipe.ui.sceneAreas.map(sceneArea => sceneArea.id),
            sources: recipe.model.sources,
            dates: recipe.model.dates,
            sceneSelectionOptions: recipe.model.sceneSelectionOptions,
            sceneCount: recipe.ui.autoSelectScenes,
            cloudCoverTarget: 0.001
        }).pipe(
            takeUntil(this.request$)
        )
    }

    render() {
        const {action} = this.props
        return (
            <div>
                {action('AUTO_SELECT_SCENES').dispatching
                    ? <MapStatus message={msg('process.mosaic.panel.autoSelectScenes.selecting')}/>
                    : null}
            </div>
        )
    }

    componentDidMount() {
        const {stream} = this.props
        this.request$.subscribe(() => {
            this.recipeActions.setAutoSelectScenesState('RUNNING').dispatch()
            stream('AUTO_SELECT_SCENES',
                this.autoSelectScenes$(),
                scenes => {
                    this.recipeActions.setSelectedScenes(scenes).dispatch()
                    this.recipeActions.setAutoSelectScenesState(null).dispatch()
                }
            )
        })
    }

    componentDidUpdate() {
        if (this.props.recipe.ui.autoSelectScenesState === 'SUBMITTED') {
            this.request$.next()
        }
    }
}

export const AutoSelectScenes = compose(
    _AutoSelectScenes,
    withRecipe(mapRecipeToProps)
)
