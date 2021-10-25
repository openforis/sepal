import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {recipeAccess} from '../../../../recipeAccess'
import {switchMap} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class _RecipeSection extends React.Component {
    render() {
        const {stream, recipes, input} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <Form.Combo
                label={msg('process.remapping.panel.inputImagery.form.recipe.label')}
                input={input}
                placeholder={msg('process.remapping.panel.inputImagery.form.recipe.placeholder')}
                options={options}
                autoFocus
                onChange={({value}) => this.loadBands(value)}
                errorMessage
                busyMessage={stream('LOAD_RECIPE_BANDS').active}
            />
        )
    }

    loadBands(recipeId) {
        const {stream, onLoading, onLoaded, loadRecipe$} = this.props
        if (recipeId) {
            onLoading(recipeId)
            stream('LOAD_RECIPE_BANDS',
                loadRecipe$(recipeId).pipe(
                    switchMap(recipe => api.gee.bands$({recipe}))
                ),
                bands => onLoaded({id: recipeId, bands}),

            )
        }
    }
}

export const RecipeSection = compose(
    _RecipeSection,
    connect(),
    recipeAccess()
)

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
    recipes: PropTypes.array
}

export default compose(
    RecipeSection,
    connect(mapStateToProps)
)
