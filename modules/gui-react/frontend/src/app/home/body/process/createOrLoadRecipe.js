import actionBuilder from 'action-builder'
import Http from 'http-client'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import {Button, IconButton} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import styles from './createOrLoadRecipe.module.css'

const CreateOrLoadRecipe = () =>
    <div className={styles.container}>
        <div className={styles.createButtons}>
            <CreateButton label={msg('process.mosaic.create')}/>
            <CreateButton label={msg('process.classification.create')}/>
            <CreateButton label={msg('process.changeDetection.create')}/>
            <CreateButton label={msg('process.timeSeries.create')}/>
        </div>

        <RecipeList/>
    </div>

export default CreateOrLoadRecipe

const mapStateToProps = () => ({
    recipes: select('process.recipes')
})

const loadRecipes$ = () =>
    Http.get$('/processing-recipes')
        .map((e) => actionBuilder('SET_RECIPES')
            .set('process.recipes', e.response)
            .build())


class RecipeList extends React.Component {
    componentWillMount() {
        if (!this.props.recipes)
            this.props.asyncActionBuilder('LOAD_RECIPES', loadRecipes$())
                .dispatch()
    }

    render() {
        const {recipes, action} = this.props
        if (!recipes && !action('LOAD_RECIPES').dispatched)
            return <CenteredProgress title={msg('process.recipe.loading')}/>
        return (
            <div className={styles.recipesTable}>
                <div className={styles.recipesHeader}>
                    <div className={styles.name}>{msg('process.recipe.name')}</div>
                    <div className={styles.type}>{msg('process.recipe.type')}</div>
                </div>
                <div className={styles.recipeRows}>
                    {(recipes || []).map((recipe) =>
                        <div key={recipe.id} className={styles.recipe}>
                            <div className={styles.name}>{recipe.name}</div>
                            <div className={styles.type}>{recipe.type}</div>
                            <div className={styles.duplicate}><RecipeButton icon='clone'/></div>
                            <div className={styles.delete}><RecipeButton icon='trash'/></div>
                        </div>
                    )}
                </div>
            </div>
        )
    }
}

RecipeList = connect(mapStateToProps)(RecipeList)

const CreateButton = ({label, onCreate}) =>
    <Button icon='plus-circle' onClick={onCreate} className={styles.createButton}>{label}</Button>

const RecipeButton = ({icon, onClick}) =>
    <IconButton icon={icon} onClick={onClick} className={styles.recipeButton}/>