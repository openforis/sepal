import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'

import {getRecipeType} from '../recipeTypeRegistry'
import {folderDescription} from './folderItem'
import {PATH_SEPARATOR} from './recipeListConstants'
import {folderCounts} from './recipeTree'

const mapStateToProps = () => ({
    folders: select('process.folders'),
    recipes: select('process.recipes')
})

class _RecipeListConfirm extends React.Component {
    render() {
        const {items} = this.props
        return (
            <Layout type='vertical' spacing='tight'>
                {items.map(item => item.kind === 'folder'
                    ? this.renderFolder(item.folder)
                    : this.renderRecipe(item.recipe))}
            </Layout>
        )
    }

    renderFolder(folder) {
        const {folders, recipes} = this.props
        const counts = folderCounts(folders || [], recipes || [], folder.id)
        return (
            <ListItem key={folder.id}>
                <CrudItem
                    icon='folder-open'
                    iconSize='lg'
                    title={folder.name}
                    description={this.isDisabled(folder.id)
                        ? msg('process.folder.remove.stays')
                        : folderDescription(counts)}
                    {...this.selection(folder.id)}
                />
            </ListItem>
        )
    }

    renderRecipe(recipe) {
        return (
            <ListItem key={recipe.id}>
                <CrudItem
                    title={this.getRecipeTypeName(recipe.type)}
                    description={this.getRecipePath(recipe)}
                    timestamp={recipe.updateTime}
                    {...this.selection(recipe.id)}
                />
            </ListItem>
        )
    }

    // A row that cannot take part shows an empty box that does not answer, rather than no box at all:
    // it belongs to the selection the dialog was opened with, and saying so is the point.
    selection(id) {
        const {isSelected, onSelect} = this.props
        const disabled = this.isDisabled(id)
        return {
            selected: disabled ? false : (isSelected ? isSelected(id) : undefined),
            selectDisabled: disabled,
            onSelect: disabled || !onSelect ? undefined : () => onSelect(id)
        }
    }

    isDisabled(id) {
        const {disabledIds} = this.props
        return !!disabledIds && disabledIds.includes(id)
    }

    getRecipePath(recipe) {
        const {folders} = this.props
        const folder = _.find(folders, ({id}) => id === recipe.folderId)
        return [
            folder?.name ?? msg('process.recipeList.root'),
            recipe.name
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
    items: PropTypes.array.isRequired,
    disabledIds: PropTypes.array,
    isSelected: PropTypes.func,
    onSelect: PropTypes.func
}
