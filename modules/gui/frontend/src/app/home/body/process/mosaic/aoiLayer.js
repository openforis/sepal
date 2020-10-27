import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    aoi: selectFrom(recipe, 'model.aoi')
})

class AoiLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        const {mapContext, aoi} = this.props
        setAoiLayer({
            mapContext,
            aoi,
            // destroy$: componentWillUnmount$,
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi')
        })
    }
}

export default compose(
    AoiLayer,
    withRecipe(mapRecipeToProps)
)
