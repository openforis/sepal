import _ from 'lodash'
import React from 'react'
import {connect} from 'store'
import Menu, {MenuItem} from 'widget/menu'
import {RecipeState} from './recipe'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState && recipeState(),
    }
}

class ProcessMenu extends React.Component {
    render() {
        const {recipe} = this.props
        if (recipe)
            return (
                <Menu>
                    {this.isRecipeSaved()
                        ? this.renderSavedRecipeItems()
                        : this.renderUnsavedRecipeItems()}
                    <MenuItem onClick={() => this.exportRecipe()}>Export recipe</MenuItem>
                </Menu>
            )
        else
            return null
    }

    renderUnsavedRecipeItems() {
        return (
            <React.Fragment>
                <MenuItem onClick={() => this.saveRecipe()}>Save recipe</MenuItem>
            </React.Fragment>
        )
    }

    renderSavedRecipeItems() {
        return (
            <React.Fragment>
                <MenuItem>Another menu item</MenuItem>
            </React.Fragment>
        )

    }

    isRecipeSaved() {
        const {recipe} = this.props
        return recipe.title // TODO: Could be saved without title
    }

    saveRecipe() {
        const {recipe} = this.props
        // TODO: Implement...
        console.log('saving', recipe)
    }

    exportRecipe() {
        const {recipe} = this.props
        setTimeout(() => {
            // var cache = []
            // const replacer = function (key, value) {
            //     if (typeof value === 'object' && value !== null) {
            //         if (cache.indexOf(value) !== -1) {
            //             // Duplicate reference found
            //             try {
            //                 // If this value does not reference a parent it can be deduped
            //                 return JSON.parse(JSON.stringify(value))
            //             } catch (error) {
            //                 // discard key if value cannot be deduped
            //                 return
            //             }
            //         }
            //         // Store value in our collection
            //         cache.push(value)
            //     }
            //     return value
            // }
            const replacer = null

            const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(_.omit(recipe, ['ui']), replacer, 2))
            var downloadElement = document.createElement('a')
            downloadElement.setAttribute('href', data)
            downloadElement.setAttribute('download', `${recipe.title || recipe.placeholder}.json`)
            document.body.appendChild(downloadElement)
            downloadElement.click()
            downloadElement.remove()
        }, 0)
    }
}

export default connect(mapStateToProps)(ProcessMenu)