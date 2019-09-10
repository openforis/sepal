import {CreateRecipe} from './createRecipe'
import {RecipeList} from './recipeList'
import {closeTab} from 'widget/tabs/tabs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {duplicateRecipe$, isRecipeOpen, loadRecipe$, removeRecipe$, selectRecipe} from './recipe'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    const recipes = select('process.recipes')
    return {
        recipes: recipes ? recipes : null
    }
}

class _RecipeHome extends React.Component {
    render() {
        const {recipeId, recipes} = this.props
        return (
            <React.Fragment>
                <CreateRecipe
                    recipeId={recipeId}
                    trigger={recipes && !recipes.length}/>
                <RecipeList
                    onSelect={recipeId => this.openRecipe(recipeId)}
                    onDuplicate={recipeId => this.duplicateRecipe(recipeId)}
                    onRemove={recipeId => this.removeRecipe(recipeId)}
                />
            </React.Fragment>
        )
    }

    openRecipe(recipeId) {
        const {stream} = this.props
        if (isRecipeOpen(recipeId)) {
            selectRecipe(recipeId)
        } else {
            stream('LOAD_RECIPE',
                loadRecipe$(recipeId)
            )
        }
    }

    duplicateRecipe(recipeIdToDuplicate) {
        const {stream} = this.props
        stream('DUPLICATE_RECIPE',
            duplicateRecipe$(recipeIdToDuplicate, this.props.recipeId)
        )
    }

    removeRecipe(recipeId) {
        const {stream} = this.props
        stream('REMOVE_RECIPE',
            removeRecipe$(recipeId),
            () => {
                closeTab(recipeId, 'process')
                Notifications.success({message: msg('process.recipe.remove.success')})
            })
    }
}

export const RecipeHome = compose(
    _RecipeHome,
    connect(mapStateToProps)
)

RecipeHome.propTypes = {
    recipeId: PropTypes.string.isRequired
}
