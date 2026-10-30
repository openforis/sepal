import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {ModalScope} from '~/widget/panel/modalScope'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {closeTab} from '~/widget/tabs/tabActions'

import {duplicateRecipe$, openRecipeById$, removeRecipes$} from './recipe'
import styles from './recipeHome.module.css'
// import {publishEvent} from '~/eventPublisher'
import {RecipeList} from './recipeList/recipeList'

const mapStateToProps = () => ({
    recipes: select('process.recipes'),
    loadedRecipes: select('process.loadedRecipes') || {}
})

class _RecipeHome extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <ModalScope scope='application'>
                <SectionLayout>
                    <Content className={styles.container} horizontalPadding verticalPadding menuPadding>
                        <RecipeList
                            recipeId={recipeId}
                            onClick={recipeId => this.openRecipe(recipeId)}
                            onDuplicate={recipeId => this.duplicateRecipe(recipeId)}
                            onRemove={recipeIds => this.removeRecipes(recipeIds)}
                        />
                    </Content>
                </SectionLayout>
            </ModalScope>
        )
    }

    openRecipe(recipeId) {
        const {stream} = this.props
        stream('LOAD_RECIPE', openRecipeById$(recipeId, {inNewTab: false}))
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
