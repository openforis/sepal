import {Pageable} from 'widget/pageable/pageable'
import {Provider} from './recipeListContext'
import {RecipeListData} from './recipeListData'
import {RecipeListPagination} from './recipeListPagination'
import {compose} from 'compose'
import {connect, select} from 'store'
import {simplifyString, splitString} from 'string'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const mapStateToProps = () => ({
    projects: select('process.projects'),
    projectId: select('process.projectId'),
    recipes: select('process.recipes'),
    sortingOrder: select('process.sortingOrder') ?? 'updateTime',
    sortingDirection: select('process.sortingDirection') ?? -1,
    filterValue: select('process.filterValue'),
    filterValues: select('process.filterValues') ?? [],
    selectedIds: select('process.selectedIds') ?? [],
    filteredRecipes: select('process.filteredRecipes') ?? []
})

class _RecipeList extends React.Component {
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
        const {projectId, recipeId, projects, sortingOrder, sortingDirection, filterValue, filterValues, selectedIds, filteredRecipes, children} = this.props
        return filteredRecipes ? (
            <Provider value={{
                projectId,
                recipeId,
                selectedIds,
                projects,
                filterValue,
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
                <Pageable items={filteredRecipes}>
                    {children}
                </Pageable>
            </Provider>
        ) : null
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
        actionBuilder('SET_FILTER_VALUES', {filterValue, filterValues})
            .set(['process.filterValue'], filterValue)
            .set(['process.filterValues'], filterValues)
            .dispatch()
    }

    setSorting(sortingOrder) {
        const {sortingOrder: prevSortingOrder, sortingDirection: prevSortingDirection} = this.props
        const sortingDirection = sortingOrder === prevSortingOrder
            ? -prevSortingDirection
            : 1
        actionBuilder('SET_SORTING_ORDER', {sortingOrder})
            .set(['process.sortingOrder'], sortingOrder)
            .set(['process.sortingDirection'], sortingDirection)
            .dispatch()
    }

    isSelected(recipeId) {
        const filteredSelectedIds = this.getFilteredSelectedIds()
        return recipeId
            ? filteredSelectedIds.includes(recipeId)
            : filteredSelectedIds.length
    }

    setSelectedIds(selectedIds) {
        actionBuilder('SET_SELECTED_IDS', {selectedIds})
            .set(['process.selectedIds'], selectedIds)
            .dispatch()
    }

    toggleOne(recipeId) {
        const {selectedIds: prevSelectedIds} = this.props
        const selectedIds = prevSelectedIds.includes(recipeId)
            ? prevSelectedIds.filter(currentRecipeId => currentRecipeId !== recipeId)
            : [...prevSelectedIds, recipeId]
        this.setSelectedIds(selectedIds)
    }

    toggleAll() {
        const {selectedIds: prevSelectedIds} = this.props
        const filteredIds = this.getFilteredIds()
        const filteredSelectedIds = this.getFilteredSelectedIds()
        const selectedIds = filteredSelectedIds.length
            ? _.difference(prevSelectedIds, filteredSelectedIds)
            : [...prevSelectedIds, ...filteredIds]
        this.setSelectedIds(selectedIds)
    }

    moveSelected(projectId) {
        const {onMove} = this.props
        const selectedIds = this.getFilteredSelectedIds()
        onMove(selectedIds, projectId)
    }

    removeSelected() {
        const {onRemove} = this.props
        const selectedIds = this.getFilteredSelectedIds()
        onRemove(selectedIds)
    }

    getFilteredIds() {
        const {filteredRecipes} = this.props
        return filteredRecipes.map(({id}) => id)
    }

    getFilteredSelectedIds() {
        const {selectedIds} = this.props
        const filteredIds = this.getFilteredIds()
        const filteredSelectedIds = _.intersection(selectedIds, filteredIds)
        return filteredSelectedIds
    }

    recipeMatchesProject(recipe) {
        const {projectId} = this.props
        return !projectId || projectId === recipe.projectId
    }

    recipeMatchesFilter(recipe, filterValues) {
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

    getSorter(recipe, sortingOrder) {
        switch (sortingOrder) {
        case 'updateTime':
            return this.getSorterByUpdateTime(recipe)
        case 'name':
            return this.getSorterByName(recipe)
        }
    }

    getSorterByUpdateTime(recipe) {
        return recipe.updateTime
    }

    getSorterByName(recipe) {
        const project = recipe?.project
        const sorter = project
            ? `1:${recipe?.project}:${recipe.name}`
            : `0:${recipe.name}`
        return sorter.toUpperCase()
    }

    updateFilteredRecipes() {
        const {projects, recipes, filterValues} = this.props
        const {sortingOrder, sortingDirection} = this.props
        const filteredRecipes = _.chain(recipes)
            .map(recipe => {
                const project = projects.find(project => project.id === recipe.projectId)
                return {...recipe, project: project?.name}
            })
            .filter(recipe => this.recipeMatchesProject(recipe) && this.recipeMatchesFilter(recipe, filterValues))
            .orderBy(recipe => this.getSorter(recipe, sortingOrder), sortingDirection === 1 ? 'asc' : 'desc')
            .value()
        actionBuilder('SET_FILTERED_RECIPES', {filteredRecipes})
            .set(['process.filteredRecipes'], filteredRecipes)
            .dispatch()
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(this.props, prevProps)) {
            this.updateFilteredRecipes()
        }
    }
}

export const RecipeList = compose(
    _RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    children: PropTypes.any.isRequired,
    onMove: PropTypes.func,
    onRemove: PropTypes.func
}

RecipeList.Data = RecipeListData

RecipeList.Pagination = RecipeListPagination
