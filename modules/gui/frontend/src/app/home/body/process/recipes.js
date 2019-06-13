import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {CenteredProgress} from 'widget/progress'
import {PageControls, PageData, Pageable} from 'widget/pageable'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {closeTab} from 'widget/tabs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {duplicateRecipe$, isRecipeOpen, loadRecipe$, loadRecipes$, removeRecipe$, selectRecipe} from './recipe'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import CreateRecipe from './createRecipe'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import SuperButton from 'widget/superButton'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import styles from './recipes.module.css'
import {getRecipeType} from './recipeTypes'

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

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
    }

    componentDidMount() {
        if (!this.props.recipes) {
            this.props.stream('LOAD_RECIPES', loadRecipes$())
        }
    }

    openRecipe(recipeId) {
        if (isRecipeOpen(recipeId)) {
            selectRecipe(recipeId)
        } else {
            this.props.stream('LOAD_RECIPE', loadRecipe$(recipeId))
        }
    }

    duplicateRecipe(recipeIdToDuplicate) {
        this.props.stream('DUPLICATE_RECIPE', duplicateRecipe$(recipeIdToDuplicate, this.props.recipeId))
    }

    removeRecipe(recipeId) {
        this.props.stream('REMOVE_RECIPE',
            removeRecipe$(recipeId),
            () => {
                closeTab(recipeId, 'process')
                Notifications.success({message: msg('process.recipe.remove.success')})
            })
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
        this.setState({
            filter
        })
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
            return recipes || []
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderRecipe(recipe) {
        return (
            <SuperButton
                key={recipe.id}
                description={recipe.name}
                duplicateTooltip={msg('process.menu.duplicateRecipe')}
                removeMessage={msg('process.menu.removeRecipe.message', {recipe: recipe.name})}
                removeTooltip={msg('process.menu.removeRecipe.tooltip')}
                title={this.getRecipeTypeName(recipe.type)}
                timestamp={recipe.updateTime}
                onClick={() => this.openRecipe(recipe.id)}
                onDuplicate={() => this.duplicateRecipe(recipe.id)}
                onRemove={() => this.removeRecipe(recipe.id)}
            />
        )
    }

    renderRecipies() {
        const {recipes, action} = this.props
        return !recipes && !action('LOAD_RECIPES').dispatched
            ? this.renderProgress()
            : (
                <ScrollableContainer>
                    <Unscrollable>
                        {this.renderSearchAndSort()}
                    </Unscrollable>
                    <Unscrollable className={styles.recipes}>
                        <PageData>
                            {recipe => this.renderRecipe(recipe)}
                        </PageData>
                    </Unscrollable>trans
                </ScrollableContainer>
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
                    autoFocus={!isMobile()}
                    onChange={e => this.setFilter(e.target.value)}
                />
            </Button>
        )
    }

    renderSearchAndSort() {
        const {recipes} = this.props
        if (!recipes || !recipes.length)
            return null
        else
            return (
                <div className={styles.header}>
                    {this.renderSearch()}

                    <div>
                        <div className={styles.orderBy}>
                            {this.renderSortButton('updateTime', msg('process.recipe.updateTime'))}
                            {this.renderSortButton('name', msg('process.recipe.name'), [styles.nameSort])}
                        </div>
                    </div>
                </div>
            )
    }

    render() {
        const {recipeId, recipes} = this.props
        return (
            <React.Fragment>
                <CreateRecipe
                    recipeId={recipeId}
                    trigger={recipes && !recipes.length}/>
                <Pageable items={this.getSortedRecipes()}>
                    <SectionLayout>
                        <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                            {this.renderRecipies()}
                        </Content>
                        <BottomBar className={styles.bottomBar}>
                            {recipes && recipes.length
                                ? <PageControls/>
                                : <div>{msg('process.menu.noSavedRecipies')}</div>
                            }
                        </BottomBar>
                    </SectionLayout>
                </Pageable>
            </React.Fragment>
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

export default compose(
    RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    recipeId: PropTypes.string.isRequired,
    recipies: PropTypes.array
}
