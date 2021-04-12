import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {CreateRecipe} from './createRecipe'
import {RecipeList} from './recipeList/recipeList'
import {StaticMap} from '../../map/staticMap'
import {closeTab} from 'widget/tabs/tabs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {duplicateRecipe$, initializeRecipe, isRecipeOpen, openRecipe, removeRecipe$, selectRecipe} from './recipe'
import {map, tap} from 'rxjs/operators'
import {msg} from 'translate'
import {of} from 'rxjs'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import styles from './recipeHome.module.css'

const mapStateToProps = () => {
    const recipes = select('process.recipes')
    return {
        recipes: recipes ? recipes : null,
        loadedRecipes: select('process.loadedRecipes') || {}
    }
}

class _RecipeHome extends React.Component {
    render() {
        const {recipeId, recipes} = this.props
        return (
            <StaticMap>
                <RecipeList>
                    <SectionLayout>
                        <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                            <CreateRecipe
                                recipeId={recipeId}
                                trigger={recipes && !recipes.length}/>
                            <RecipeList.Data
                                onSelect={recipeId => this.openRecipeId(recipeId)}
                                onDuplicate={recipeId => this.duplicateRecipe(recipeId)}
                                onRemove={recipeId => this.removeRecipe(recipeId)}
                            />
                        </Content>
                        <BottomBar className={styles.bottomBar}>
                            {recipes && recipes.length
                                ? <RecipeList.Pagination/>
                                : <div>{msg('process.menu.noSavedRecipes')}</div>
                            }
                        </BottomBar>
                    </SectionLayout>
                </RecipeList>
            </StaticMap>
        )
    }

    openRecipeId(recipeId) {
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
