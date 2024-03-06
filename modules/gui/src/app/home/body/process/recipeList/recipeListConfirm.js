import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {NO_PROJECT_SYMBOL, PROJECT_RECIPE_SEPARATOR} from './recipeListConstants'
import {compose} from 'compose'
import {connect} from 'connect'
import {getRecipeType} from '../recipeTypeRegistry'
import {select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapStateToProps = () => ({
    projects: select('process.projects')
})

class _RecipeListConfirm extends React.Component {
    render() {
        const {recipes} = this.props
        return (
            <Layout type='vertical' spacing='tight'>
                {recipes.map(recipe => this.renderRecipe(recipe))}
            </Layout>
        )
    }

    renderRecipe(recipe) {
        const {isSelected, onSelect} = this.props
        return (
            <ListItem key={recipe.id}>
                <CrudItem
                    title={this.getRecipeTypeName(recipe.type)}
                    description={this.getRecipePath(recipe)}
                    timestamp={recipe.updateTime}
                    selected={isSelected ? isSelected(recipe.id) : undefined}
                    onSelect={onSelect ? () => onSelect(recipe.id) : undefined}
                />
            </ListItem>
        )
    }

    getRecipePath(recipe) {
        const {projects} = this.props
        const name = recipe.name
        const project = _.find(projects, ({id}) => id === recipe.projectId)
        return [
            project?.name ?? NO_PROJECT_SYMBOL,
            name
        ].join(PROJECT_RECIPE_SEPARATOR)
    }

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
    }

}

export const RecipeListConfirm = compose(
    _RecipeListConfirm,
    connect(mapStateToProps)
)

RecipeListConfirm.propTypes = {
    recipes: PropTypes.array.isRequired,
    isSelected: PropTypes.func,
    onSelect: PropTypes.func
}
