import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'

import {getRecipeType} from '../recipeTypeRegistry'
import {NO_FOLDER_SYMBOL, PATH_SEPARATOR} from './recipeListConstants'

const mapStateToProps = () => ({
    folders: select('process.folders')
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
        const {folders} = this.props
        const name = recipe.name
        const folder = _.find(folders, ({id}) => id === recipe.folderId)
        return [
            folder?.name ?? NO_FOLDER_SYMBOL,
            name
        ].join(PATH_SEPARATOR)
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
