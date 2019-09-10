import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getRecipeType} from './recipeTypes'
import {loadRecipes$} from './recipe'
import {msg} from 'translate'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './recipeList.module.css'

const mapStateToProps = () => {
    const recipes = select('process.recipes')
    return {
        recipes: recipes ? recipes : null
    }
}

class _RecipeList extends React.Component {
    state = {
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        filterValues: []
    }

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
    }

    componentDidMount() {
        if (!this.props.recipes) {
            this.props.stream('LOAD_RECIPES', loadRecipes$())
        }
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
        const {recipes} = this.props
        const {sortingOrder, sortingDirection} = this.state
        return _.orderBy(recipes, recipe => {
            const item = _.get(recipe, sortingOrder)
            return _.isString(item) ? item.toUpperCase() : item
        }, sortingDirection === 1 ? 'asc' : 'desc')
    }
    
    setFilter(filterValues) {
        this.setState({
            filterValues
        })
    }

    recipeMatchesFilter(recipe) {
        const {filterValues} = this.state
        const searchMatchers = filterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['name']
        return filterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(recipe[property])
                )
            )
            : true
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderRecipe(recipe, highlightMatcher) {
        const {onSelect, onDuplicate, onRemove} = this.props
        return (
            <SuperButton
                key={recipe.id}
                title={this.getRecipeTypeName(recipe.type)}
                description={recipe.name}
                timestamp={recipe.updateTime}
                highlight={highlightMatcher}
                duplicateTooltip={msg('process.menu.duplicateRecipe')}
                removeMessage={msg('process.menu.removeRecipe.message', {recipe: recipe.name})}
                removeTooltip={msg('process.menu.removeRecipe.tooltip')}
                onClick={onSelect ? () => onSelect(recipe.id) : null}
                onDuplicate={onDuplicate ? () => onDuplicate(recipe.id) : null}
                onRemove={onRemove ? () => onRemove(recipe.id) : null}
            />
        )
    }

    renderRecipes() {
        const {recipes, action} = this.props
        const {filterValues} = this.state
        const highlightMatcher = filterValues.length
            ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
            : null
        return !recipes && !action('LOAD_RECIPES').dispatched
            ? this.renderProgress()
            : (
                <ScrollableContainer>
                    <Unscrollable>
                        {this.renderSearchAndSort()}
                    </Unscrollable>
                    <Unscrollable className={styles.recipes}>
                        <Pageable.Data
                            itemKey={recipe => `${recipe.id}|${highlightMatcher}`}>
                            {recipe => this.renderRecipe(recipe, highlightMatcher)}
                        </Pageable.Data>
                    </Unscrollable>
                </ScrollableContainer>
            )
    }

    renderSearch() {
        return (
            <SearchBox
                placeholder={msg('process.menu.searchRecipes')}
                onSearchValues={searchValues => this.setFilter(searchValues)}/>
        )
    }

    renderSearchAndSort() {
        const {recipes} = this.props
        if (!recipes || !recipes.length)
            return null
        else
            return (
                <div className={styles.header}>
                    <Layout type='horizontal' spacing='compact'>
                        {this.renderSearch()}
                        {this.renderSortButtons()}
                    </Layout>
                </div>
            )
    }

    render() {
        const {recipes} = this.props
        return (
            <React.Fragment>
                <Pageable
                    items={this.getSortedRecipes()}
                    matcher={recipe => this.recipeMatchesFilter(recipe)}>
                    <SectionLayout>
                        <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                            {this.renderRecipes()}
                        </Content>
                        <BottomBar className={styles.bottomBar}>
                            {recipes && recipes.length
                                ? <Pageable.Controls/>
                                : <div>{msg('process.menu.noSavedRecipies')}</div>
                            }
                        </BottomBar>
                    </SectionLayout>
                </Pageable>
            </React.Fragment>
        )
    }

    renderSortButtons() {
        return (
            <div className={styles.orderBy}>
                {this.renderSortButton('updateTime', msg('process.recipe.updateTime'))}
                {this.renderSortButton('name', msg('process.recipe.name'), [styles.nameSort])}
            </div>
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

export const RecipeList = compose(
    _RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
