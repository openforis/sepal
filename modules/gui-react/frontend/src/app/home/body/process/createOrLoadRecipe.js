import actionBuilder from 'action-builder'
import flexy from 'flexy.module.css'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import {Button, IconButton} from 'widget/button'
import {HoldButton} from 'widget/holdButton'
import {CenteredProgress} from 'widget/progress'
import styles from './createOrLoadRecipe.module.css'
import {deleteRecipe, duplicateRecipe$, loadRecipe$, loadRecipes$} from './recipe'

const CreateOrLoadRecipe = ({recipeId}) =>
    <div className={[styles.container, flexy.container].join(' ')}>
        <div className={styles.createButtons}>
            <CreateButton label={msg('process.mosaic.create')} recipeId={recipeId} type='MOSAIC'/>
            <CreateButton label={msg('process.classification.create')} recipeId={recipeId} type='CLASSIFICATION'/>
            <CreateButton label={msg('process.changeDetection.create')} recipeId={recipeId} type='CHANGE_DETECTION'/>
            <CreateButton label={msg('process.timeSeries.create')} recipeId={recipeId} type='TIME_SERIES'/>
        </div>
        <RecipeList/>
    </div>

CreateOrLoadRecipe.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default CreateOrLoadRecipe

const mapStateToProps = () => ({
    recipes: select('process.recipes')
})

class RecipeList extends React.Component {
    componentWillMount() {
        if (!this.props.recipes)
            this.props.asyncActionBuilder('LOAD_RECIPES', loadRecipes$())
                .dispatch()
    }

    loadRecipe(recipeId) {
        this.props.asyncActionBuilder('LOAD_RECIPE', loadRecipe$(recipeId))
            .dispatch()
    }

    duplicateRecipe(recipeId) {
        this.props.asyncActionBuilder('DUPLICATE_RECIPE', duplicateRecipe$(recipeId))
            .dispatch()
    }

    render() {
        const {recipes, action} = this.props
        if (!recipes && !action('LOAD_RECIPES').dispatched)
            return <CenteredProgress title={msg('process.recipe.loading')}/>
        return (
            <div className={[styles.recipesTable, flexy.container].join(' ')}>
                <div className={styles.recipesHeader}>
                    <div className={styles.name}>{msg('process.recipe.name')}</div>
                    <div className={styles.type}>{msg('process.recipe.type')}</div>
                </div>
                <div className={[styles.recipeRows, flexy.scrollable].join(' ')}>
                    {(recipes || []).map((recipe) =>
                        <div key={recipe.id} className={styles.recipe} onClick={() => this.loadRecipe(recipe.id)}>
                            <div className={styles.name}>{recipe.name}</div>
                            <div className={styles.type}>{recipe.type}</div>
                            <div className={styles.duplicate}>
                                <RecipeButton
                                    icon='clone'
                                    iconType='regular'
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        this.duplicateRecipe(recipe.id)
                                    }}/>
                            </div>
                            <div className={styles.delete}>
                                <HoldButton
                                    icon='trash-alt'
                                    className={styles.recipeButton}
                                    onClickHold={() => deleteRecipe(recipe.id)}/>
                                {/*<RecipeButton*/}
                                {/*icon='trash-alt'*/}
                                {/*iconType='regular'*/}
                                {/*onClick={(e) => {*/}
                                {/*e.stopPropagation()*/}
                                {/*deleteRecipe(recipe.id)*/}
                                {/*}}/>*/}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }
}

RecipeList = connect(mapStateToProps)(RecipeList)

const setTabType = (recipeId, type, title) =>
    actionBuilder('SET_TAB_TYPE')
        .withState('process.tabs', (recipes, stateBuilder) => {
            const recipeIndex = recipes.findIndex((recipe) => recipe.id === recipeId)
            if (recipeIndex === -1)
                throw new Error('Unable to create recipe')
            return stateBuilder
                .set(['process', 'tabs', recipeIndex, 'type'], type)
                .set(['process', 'tabs', recipeIndex, 'placeholder'], `${title}_${formatDate(new Date())}`)
        })
        .dispatch()

const CreateButton = ({recipeId, type, label}) =>
    <Button icon='plus-circle' onClick={() => setTabType(recipeId, type, label)}
            className={styles.createButton}>{label}</Button>

const RecipeButton = ({icon, iconType, onClick}) =>
    <IconButton icon={icon} iconType={iconType} onClick={onClick} className={styles.recipeButton}/>

function formatDate(date) {
    const pad = (value) => ('' + value).length < 2 ? '0' + value : value
    let d = new Date(date),
        month = pad(d.getMonth() + 1),
        day = pad(d.getDate()),
        year = pad(d.getFullYear()),
        hours = pad(d.getHours()),
        minutes = pad(date.getMinutes()),
        seconds = pad(date.getSeconds())
    return `${[year, month, day].join('-')}_${[hours, minutes, seconds].join('-')}`
}
