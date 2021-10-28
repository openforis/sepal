import {Pageable} from 'widget/pageable/pageable'
import {Provider} from './recipeListContext'
import {RecipeListData} from './recipeListData'
import {RecipeListPagination} from './recipeListPagination'
import {compose} from 'compose'
import {connect, select} from 'store'
import {loadRecipes$} from '../recipe'
import {msg} from 'translate'
import {simplifyString} from 'string'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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

    render() {
        const {children} = this.props
        const {sortingOrder, sortingDirection, filterValues} = this.state
        return (
            <Provider value={{
                sortingOrder,
                sortingDirection,
                isLoading: this.isLoading.bind(this),
                hasData: this.hasData.bind(this),
                setSorting: this.setSorting.bind(this),
                setFilter: this.setFilter.bind(this),
                highlightMatcher: filterValues.length
                    ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
                    : null
            }}>
                <Pageable items={this.getRecipes()}>
                    {children}
                </Pageable>
            </Provider>
        )
    }

    componentDidMount() {
        const {recipes, stream} = this.props
        if (!recipes) {
            stream('LOAD_RECIPES',
                loadRecipes$(),
                null,
                () => Notifications.error({message: msg('process.recipe.loadingError'), timeout: -1})
            )
        }
    }

    isLoading() {
        const {recipes, stream} = this.props
        return !recipes && stream('LOAD_RECIPES').active
    }

    hasData() {
        const {recipes} = this.props
        return recipes && recipes.length
    }

    setFilter(filterValues) {
        this.setState({
            filterValues
        })
    }

    setSorting(sortingOrder) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder
                ? -prevState.sortingDirection
                : 1
            return {
                sortingOrder,
                sortingDirection
            }
        })
    }

    getRecipes() {
        const {recipes} = this.props
        const {sortingOrder, sortingDirection} = this.state
        return _.chain(recipes)
            .filter(recipe => this.recipeMatchesFilter(recipe))
            .orderBy(recipe => {
                const item = _.get(recipe, sortingOrder)
                return _.isString(item) ? item.toUpperCase() : item
            }, sortingDirection === 1 ? 'asc' : 'desc')
            .value()
    }

    recipeMatchesFilter(recipe) {
        const {filterValues} = this.state
        const searchMatchers = filterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['name']
        return filterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(recipe[property]))
                )
            )
            : true
    }
}

export const RecipeList = compose(
    _RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    children: PropTypes.any.isRequired
}

RecipeList.Data = RecipeListData

RecipeList.Pagination = RecipeListPagination
