import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {Button, ButtonGroup} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {PageControls, PageData, Pageable} from 'widget/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {connect, select} from 'store'
import {deleteRecipe, loadRecipe$, loadRecipes$} from './recipe'
import {map} from 'rxjs/operators'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/recipe'
import CreateRecipe from './createRecipe'
import CreateRecipeRLCMS from './createRecipeRLCMS'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'
import escapeStringRegexp from 'escape-string-regexp'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './recipes.module.css'

const mapStateToProps = () => {
    const recipes = select('process.recipes')
    return {
        recipes: recipes ? recipes : null
    }
}

class RecipeList extends React.Component {
    state = {
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        filter: ''
    }

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

    setSorting(sortingOrder) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder ? -prevState.sortingDirection : 1
            return {
                ...prevState,
                sortingOrder,
                sortingDirection,
                recipes: this.getSortedRecipes(this.props.recipes, sortingOrder, sortingDirection)
            }
        })
    }

    getSortedRecipes() {
        const {sortingOrder, sortingDirection} = this.state
        return _.orderBy(this.getFilteredRecipes(), recipe => {
            const item = _.get(recipe, sortingOrder)
            return _.isString(item) ? item.toUpperCase() : item
        }, sortingDirection === 1 ? 'asc' : 'desc')
    }

    setFilter(filter) {
        this.setState(prevState => ({
            ...prevState,
            filter
        }))
    }

    getFilteredRecipes() {
        const {recipes} = this.props
        const searchProperties = ['name']
        if (this.state.filter) {
            const filter = RegExp(escapeStringRegexp(this.state.filter), 'i')
            return recipes.filter(recipe =>
                _.find(searchProperties, searchProperty =>
                    filter.test(recipe[searchProperty])
                )
            )
        } else
            return recipes || [] // TODO: Implement filter
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
                        <div className={styles.updateTime}>{moment(recipe.updateTime).fromNow()}</div>
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

                <PageData>
                    {recipe => this.renderRecipe(recipe)}
                </PageData>
            )
    }

    renderSearch() {
        return (
            <Button
                additionalClassName={styles.search}
                look='transparent'
                size='large'
                shape='pill'
                disabled={true}>
                <input
                    type='search'
                    ref={this.search}
                    value={this.state.filter}
                    placeholder={msg('process.menu.searchRecipes')}
                    onChange={e => this.setFilter(e.target.value)}
                />
            </Button>
        )
    }

    render() {
        const {recipeId, recipes} = this.props
        return (

            <Pageable
                items={this.getSortedRecipes()}
                watch={[this.state.sortingOrder, this.state.sortingDirection, this.state.filter]}
                limit={15}>
                <SectionLayout>
                    <Content edgePadding menuPadding className={styles.container}>
                        <ScrollableContainer>
                            <Unscrollable>
                                <div className={styles.header}>
                                    {recipes && recipes.length ? this.renderSearch() : <div/>}

                                    <div>
                                        <div className={styles.orderBy}>
                                            {this.renderSortButton('updateTime', msg('process.recipe.updateTime'))}
                                            {this.renderSortButton('name', msg('process.recipe.name'), [styles.nameSort])}
                                        </div>
                                    </div>
                                </div>

                            </Unscrollable>
                            <Scrollable className={styles.recipes}>
                                {this.renderRecipies()}
                                <CreateRecipe recipeId={recipeId} recipeTypes={this.recipeTypes}/>
                            </Scrollable>
                        </ScrollableContainer>
                    </Content>
                    <BottomBar className={styles.bottomBar}>
                        {recipes && recipes.length
                            ? <PageControls/>
                            : <div>{msg('process.menu.noSavedRecipies')}</div>
                        }
                    </BottomBar>
                </SectionLayout>
            </Pageable>
        )
    }

    renderSortButton(column, label, classNames = []) {
        const {sortingOrder} = this.state
        return (
            <div className={classNames.join(' ')}>
                <Button
                    chromeless
                    shape='none'
                    additionalClassName='itemType'
                    onClick={() => this.setSorting(column)}>
                    <span className={sortingOrder === column ? styles.sorted : null}>
                        {label}
                    </span>
                    <span className={styles.sortingHandle}>
                        {this.renderSortingHandle(column)}
                    </span>

                </Button>
            </div>
        )
    }

    renderSortingHandle(column) {
        return this.state.sortingOrder === column
            ? this.state.sortingDirection === 1
                ? <Icon name={'sort-down'}/>
                : <Icon name={'sort-up'}/>
            : <Icon name={'sort'}/>
    }

}

export default connect(mapStateToProps)(RecipeList)

RecipeList.propTypes = {
    recipeId: PropTypes.string.isRequired,
    recipies: PropTypes.array
}
