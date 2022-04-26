import {Pageable} from 'widget/pageable/pageable'
import {Provider} from './recipeListContext'
import {RecipeListData} from './recipeListData'
import {RecipeListPagination} from './recipeListPagination'
import {compose} from 'compose'
import {connect, select} from 'store'
import {loadProjects$, loadRecipes$} from '../recipe'
import {msg} from 'translate'
import {simplifyString, splitString} from 'string'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapStateToProps = () => {
    const projects = select('process.projects')
    const recipes = select('process.recipes')
    return {
        projects: projects ?? null,
        recipes: recipes ? recipes.map(recipe => ({...recipe, projectId: 1})) : null
    }
}

class _RecipeList extends React.Component {
    state = {
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        filterValues: [],
        selectedIds: []
    }
    
    constructor() {
        super()
        this.isLoading = this.isLoading.bind(this)
        this.hasData = this.hasData.bind(this)
        this.setSorting = this.setSorting.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.isSelected = this.isSelected.bind(this)
        this.toggleOne = this.toggleOne.bind(this)
        this.toggleAll = this.toggleAll.bind(this)
        this.moveSelected = this.moveSelected.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
    }

    render() {
        const {projects, children} = this.props
        const {sortingOrder, sortingDirection, filterValues, selectedIds} = this.state
        return (
            <Provider value={{
                selectedIds,
                projects,
                sortingOrder,
                sortingDirection,
                isLoading: this.isLoading,
                hasData: this.hasData,
                setSorting: this.setSorting,
                setFilter: this.setFilter,
                isSelected: this.isSelected,
                toggleOne: this.toggleOne,
                toggleAll: this.toggleAll,
                moveSelected: this.moveSelected,
                removeSelected: this.removeSelected,
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
        const {projects, recipes, stream} = this.props
        if (!projects) {
            stream('LOAD_PROJECTS',
                loadProjects$(),
                null,
                () => Notifications.error({message: msg('process.project.loadingError'), timeout: -1})
            )
        }
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

    setFilter(filterValue) {
        const filterValues = splitString(simplifyString(filterValue))
        this.setState({filterValues})
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

    isSelected(recipeId) {
        const {selectedIds} = this.state
        return recipeId
            ? selectedIds.includes(recipeId)
            : selectedIds.length
    }

    toggleOne(recipeId) {
        this.setState(({selectedIds}) => ({
            selectedIds: selectedIds.includes(recipeId)
                ? selectedIds.filter(currentRecipeId => currentRecipeId !== recipeId)
                : [...selectedIds, recipeId]
        }))
    }

    toggleAll() {
        const {recipes} = this.props
        this.setState(({selectedIds}) => ({
            selectedIds: selectedIds.length
                ? []
                : recipes.map(recipe => recipe.id)
        }))
    }

    moveSelected(projectId) {
        const {selectedIds} = this.state
        console.log(`move to ${projectId}:`, selectedIds)
    }

    removeSelected() {
        const {selectedIds} = this.state
        console.log('remove:', selectedIds)
    }

    getRecipes() {
        const {projects, recipes} = this.props
        const {sortingOrder, sortingDirection} = this.state
        return _.chain(recipes)
            .map(recipe => {
                const project = projects.find(project => project.id === recipe.projectId)
                return {...recipe, project: project?.name}
            })
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
        const searchProperties = ['project', 'name']
        return filterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(recipe[property], {
                        removeNonAlphanumeric: true,
                        removeAccents: true
                    }))
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
