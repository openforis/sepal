import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {connect, select} from 'store'
import {deleteRecipe, loadRecipe$, loadRecipes$} from './recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/recipe'
import CreateRecipe from './createRecipe'
import CreateRecipeRLCMS from './createRecipeRLCMS'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import lookStyles from 'style/look.module.css'
import styles from './recipes.module.css'

const mapStateToProps = () => {
    const recipes = select('process.recipes')
    return {
        recipes: recipes ? recipes : null
    }
}

class RecipeList extends React.Component {
    recipeTypes = [{
        type: 'MOSAIC',
        name: msg('process.mosaic.create'),
        description: msg('process.mosaic.description')
    }, {
        type: 'CLASSIFICATION',
        name: msg('process.classification.create'),
        description: msg('process.classification.description')
    }, {
        type: 'CHANGE_DETECTION',
        name: msg('process.changeDetection.create'),
        description: msg('process.changeDetection.description')
    }, {
        type: 'TIME_SERIES',
        name: msg('process.timeSeries.create'),
        description: msg('process.timeSeries.description')
    }, {
        type: 'LAND_COVER',
        name: msg('process.landCover.create'),
        description: msg('process.landCover.description'),
        beta: true,
        details: <CreateRecipeRLCMS/>
    }]

    getRecipeTypeName(type) {
        const recipeType = this.recipeTypes.find(recipeType => recipeType.type === type)
        return recipeType && recipeType.name
    }

    componentDidMount() {
        if (!this.props.recipes)
            this.props.asyncActionBuilder('LOAD_RECIPES', loadRecipes$())
                .dispatch()
    }

    loadRecipe(recipeId) {
        this.props.asyncActionBuilder('LOAD_RECIPE', loadRecipe$(recipeId))
            .dispatch()
    }

    duplicateRecipe(recipeIdToDuplicate) {
        this.props.asyncActionBuilder('DUPLICATE_RECIPE', this.duplicateRecipe$(recipeIdToDuplicate))
            .dispatch()
    }

    duplicateRecipe$(recipeIdToDuplicate) {
        const {recipeId} = this.props
        return api.recipe.load$(recipeIdToDuplicate).pipe(
            map(recipe => ({
                ...recipe,
                id: recipeId,
                title: (recipe.title || recipe.placeholder) + '_copy'
            })),
            map(duplicate =>
                actionBuilder('DUPLICATE_RECIPE', {duplicate})
                    .set(recipePath(recipeId), duplicate)
                    .build()
            )
        )
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderRecipe(recipe) {
        return (
            <div
                key={recipe.id}
                className={[styles.recipe, lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => this.loadRecipe(recipe.id)}>
                <div className={styles.recipeInfo}>
                    <div className='itemType'>{this.getRecipeTypeName(recipe.type)}</div>
                    <div className={styles.name}>{recipe.name}</div>
                </div>
                <div className={styles.recipeButtons}>
                    <ButtonGroup wrap={false}>
                        <Button
                            chromeless
                            icon='clone'
                            tooltip={msg('process.menu.duplicateRecipe')}
                            tooltipPlacement='bottom'
                            onClick={() => this.duplicateRecipe(recipe.id)}/>
                        <Button
                            chromeless
                            icon='trash-alt'
                            tooltip={msg('process.menu.deleteRecipe')}
                            tooltipPlacement='bottom'
                            onClickHold={() => deleteRecipe(recipe.id)}/>
                    </ButtonGroup>
                </div>
            </div>
        )
    }

    renderRecipies() {
        const {recipes, action} = this.props
        return !recipes && !action('LOAD_RECIPES').dispatched
            ? this.renderProgress()
            : (
                <React.Fragment>
                    {(recipes || []).map(recipe => this.renderRecipe(recipe))}
                </React.Fragment>
            )
    }

    renderTitle() {
        const {recipes} = this.props
        return recipes && recipes.length
            ? <div>{msg('process.menu.savedRecipies', {count: recipes.length})}</div>
            : <div>{msg('process.menu.noSavedRecipies')}</div>
    }

    render() {
        const {recipeId} = this.props
        return (
            <SectionLayout>
                <Content edgePadding menuPadding>
                    <ScrollableContainer className={styles.container}>
                        <Unscrollable className={styles.header}>
                            {this.renderTitle()}
                            <CreateRecipe recipeId={recipeId} recipeTypes={this.recipeTypes}/>
                        </Unscrollable>
                        <Scrollable>
                            {this.renderRecipies()}
                        </Scrollable>
                    </ScrollableContainer>
                </Content>
            </SectionLayout>
        )
    }
}

export default connect(mapStateToProps)(RecipeList)

RecipeList.propTypes = {
    recipeId: PropTypes.string.isRequired,
    recipies: PropTypes.array
}
