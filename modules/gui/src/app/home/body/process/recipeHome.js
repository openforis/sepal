import {Content, SectionLayout} from 'widget/sectionLayout'
import {closeTab} from 'widget/tabs/tabActions'
import {compose} from 'compose'
import {connect} from 'connect'
import {duplicateRecipe$, initializeRecipe, isRecipeOpen, moveRecipes$, openRecipe, removeRecipes$, selectRecipe} from './recipe'
import {map, of, tap} from 'rxjs'
import {select} from 'store'
// import {publishEvent} from 'eventPublisher'
import {RecipeList} from './recipeList/recipeList'
import {actionBuilder} from 'action-builder'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'apiRegistry'
import styles from './recipeHome.module.css'

const mapStateToProps = () => ({
    recipes: select('process.recipes'),
    loadedRecipes: select('process.loadedRecipes') || {}
})

class _RecipeHome extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <SectionLayout>
                <Content className={styles.container} horizontalPadding verticalPadding menuPadding>
                    <RecipeList
                        recipeId={recipeId}
                        onClick={recipeId => this.openRecipe(recipeId)}
                        onDuplicate={recipeId => this.duplicateRecipe(recipeId)}
                        onMove={(recipeIds, projectId) => this.moveRecipes(recipeIds, projectId)}
                        onRemove={recipeIds => this.removeRecipes(recipeIds)}
                    />
                </Content>
            </SectionLayout>
        )
    }

    openRecipe(recipeId) {
        const {stream} = this.props
        if (isRecipeOpen(recipeId)) {
            selectRecipe(recipeId)
        } else {
            stream('LOAD_RECIPE',
                this.loadRecipe$(recipeId),
                recipe => openRecipe(recipe)
            )
        }
    }

    loadRecipe$(recipeId) {
        const {loadedRecipes} = this.props
        return Object.keys(loadedRecipes).includes(recipeId)
            ? of(loadedRecipes[recipeId])
            : api.recipe.load$(recipeId).pipe(
                map(recipe => initializeRecipe(recipe)),
                tap(recipe =>
                    actionBuilder('CACHE_RECIPE', recipe)
                        .set(['process.loadedRecipes', recipe.id], recipe)
                        .dispatch()
                )
            )
    }

    duplicateRecipe(recipeIdToDuplicate) {
        const {stream} = this.props
        stream('DUPLICATE_RECIPE',
            duplicateRecipe$(recipeIdToDuplicate).pipe(
                tap(() => closeTab(this.props.recipeId, 'process'))
            )
        )
    }

    removeRecipes(recipeIdOrIds) {
        const recipeIds = _.castArray(recipeIdOrIds)
        const {stream} = this.props
        // publishEvent('remove_recipe', {recipe_type: type})
        stream('REMOVE_RECIPES',
            removeRecipes$(recipeIds),
            () => recipeIds.forEach(recipeId => closeTab(recipeId, 'process'))
        )
    }

    moveRecipes(recipeIds, projectId) {
        const {stream} = this.props
        stream('MOVE_RECIPES',
            moveRecipes$(recipeIds, projectId)
        )
    }

    selectRecipe(recipe) {
        actionBuilder('SELECT_RECIPE', recipe.id)
            .assign(['process.recipes', {id: recipe.id}], {selected: !recipe.selected})
            .dispatch()
    }
}

export const RecipeHome = compose(
    _RecipeHome,
    connect(mapStateToProps)
)

RecipeHome.propTypes = {
    recipeId: PropTypes.string.isRequired
}
