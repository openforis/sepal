import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {CenteredProgress} from 'widget/progress'
import {CheckButton} from 'widget/checkButton'
import {Combo} from 'widget/combo'
import {CreateRecipe} from '../createRecipe'
import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {Pageable} from 'widget/pageable/pageable'
import {ProjectsButton} from './projectsButton'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SelectProject} from './selectProject'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getRecipeType} from '../recipeTypes'
import {msg} from 'translate'
import {simplifyString, splitString} from 'string'
import ButtonPopup from 'widget/buttonPopup'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './recipeListData.module.css'

const NO_PROJECT_SYMBOL = '#'
const PROJECT_RECIPE_SEPARATOR = ' / '

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

class _RecipeListData extends React.Component {
    state = {
        edit: false,
        move: false
    }

    constructor() {
        super()
        this.setFilter = this.setFilter.bind(this)
        this.toggleAll = this.toggleAll.bind(this)
        this.moveSelected = this.moveSelected.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
    }

    render() {
        return this.isLoading()
            ? this.renderProgress()
            : this.renderData()
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderData() {
        const {filterValues} = this.props
        const {move} = this.state
        const highlightMatcher = filterValues.length
            ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
            : null
        return this.hasData() ? (
            <ScrollableContainer>
                <Unscrollable>
                    {this.renderHeader()}
                </Unscrollable>
                <Unscrollable className={styles.recipes}>
                    <Pageable.Data
                        itemKey={recipe => `${recipe.id}|${highlightMatcher}`}>
                        {recipe => this.renderRecipe(recipe, highlightMatcher)}
                    </Pageable.Data>
                    {move && this.renderMoveConfirmation()}
                </Unscrollable>
            </ScrollableContainer>
        ) : null
    }

    renderHeader() {
        const {recipeId} = this.props
        return (
            <Layout type='vertical' spacing='compact' className={styles.header}>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                    <Layout.Spacer/>
                    {this.renderEditButtons()}
                </Layout>
                <Layout type='horizontal' spacing='compact'>
                    <CreateRecipe recipeId={recipeId}/>
                    <ProjectsButton/>
                    <SelectProject/>
                    <Layout.Spacer/>
                    {this.renderSortButtons()}
                </Layout>
            </Layout>
        )
    }

    renderSearch() {
        const {filterValue} = this.props
        return (
            <SearchBox
                value={filterValue}
                placeholder={msg('process.menu.searchRecipes')}
                onSearchValue={this.setFilter}
            />
        )
    }

    renderEditButtons() {
        const {edit} = this.state
        return (
            <ButtonGroup spacing='none'>
                {edit && this.renderSelectButton()}
                {edit && this.renderMoveButton()}
                {edit && this.renderRemoveButton()}
                <Button
                    icon='pen-to-square'
                    label={msg('process.recipe.edit.label')}
                    shape='pill'
                    keybinding={edit ? 'Escape' : ''}
                    onClick={() => this.setEdit(!edit)}
                />
            </ButtonGroup>
        )
    }

    renderSelectButton() {
        const selected = this.isSelected()
        return (
            <CheckButton
                shape='pill'
                label={msg('process.recipe.select.label')}
                checked={selected}
                tooltip={msg(selected ? 'process.recipe.select.tooltip.deselect' : 'process.recipe.select.tooltip.select')}
                onToggle={this.toggleAll}/>
        )
    }

    renderMoveButton() {
        return (
            <ButtonPopup
                shape='pill'
                icon='shuffle'
                label={msg('process.recipe.move.label')}
                placement='below'
                alignment='left'
                disabled={!this.isSelected()}
                tooltip={msg('process.recipe.move.tooltip')}>
                {onBlur => (
                    <Combo
                        placement='below'
                        alignment='left'
                        placeholder={msg('process.recipe.move.destinationProject')}
                        options={this.getDestinations()}
                        standalone
                        autoFocus
                        onCancel={onBlur}
                        onChange={option => {
                            this.setMove(option)
                            onBlur()
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderMoveConfirmation() {
        const {move: {value: projectId, label: projectName}} = this.state
        return (
            <Confirm
                title={msg('process.recipe.move.title')}
                message={msg('process.recipe.move.confirm', {count: this.isSelected(), project: projectName})}
                onConfirm={() => {
                    this.setMove(false)
                    this.moveSelected(projectId)
                }}
                onCancel={() => this.setMove(false)}
            />
        )
    }

    renderRemoveButton() {
        return (
            <RemoveButton
                shape='pill'
                icon='trash'
                label={msg('process.recipe.remove.label')}
                tooltip={msg('process.recipe.remove.tooltip')}
                message={msg('process.recipe.remove.confirm', {count: this.isSelected()})}
                disabled={!this.isSelected()}
                onRemove={this.removeSelected}/>
        )
    }

    getDestinations() {
        const {projects} = this.props
        return projects.map(({id, name}) => ({value: id, label: name}))
    }

    renderSortButtons() {
        return (
            <ButtonGroup layout='horizontal-nowrap' spacing='tight'>
                {this.renderSortButton('updateTime', msg('process.recipe.lastUpdate'))}
                {this.renderSortButton('name', msg('process.recipe.name'))}
            </ButtonGroup>
        )
    }

    renderSortButton(column, label) {
        const {sortingOrder, sortingDirection} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                shape='pill'
                label={label}
                labelStyle={sortingOrder === column ? 'smallcaps-highlight' : 'smallcaps'}
                icon={this.getHandleIcon({column, sortingOrder, sortingDirection})}
                iconPlacement='right'
                onClick={() => this.setSorting(column)}/>
        )
    }

    renderRecipe(recipe, highlightMatcher) {
        const {projects, onClick, onDuplicate, onRemove} = this.props
        const {edit} = this.state
        const name = recipe.name
        const project = _.find(projects, ({id}) => id === recipe.projectId)
        const path = [
            project?.name ?? NO_PROJECT_SYMBOL,
            name
        ].join(PROJECT_RECIPE_SEPARATOR)
        return (
            <ListItem
                key={recipe.id}
                onClick={onClick ? () => onClick(recipe.id) : null}>
                <CrudItem
                    title={this.getRecipeTypeName(recipe.type)}
                    description={path}
                    timestamp={recipe.updateTime}
                    highlight={highlightMatcher}
                    highlightTitle={false}
                    duplicateTooltip={msg('process.menu.duplicateRecipe.tooltip')}
                    removeTooltip={msg('process.menu.removeRecipe.tooltip')}
                    selectTooltip={msg('process.menu.selectRecipe.tooltip')}
                    selected={this.isSelected(recipe.id)}
                    onDuplicate={onDuplicate ? () => onDuplicate(recipe.id) : null}
                    onRemove={onRemove ? () => onRemove(recipe.id) : null}
                    onSelect={edit ? () => this.toggleOne(recipe.id) : null}
                />
            </ListItem>
        )
    }

    setEdit(edit) {
        this.setState({edit})
    }

    setMove(move) {
        this.setState({move})
    }

    getHandleIcon({column, sortingOrder, sortingDirection}) {
        const sorted = sortingOrder === column
        return sorted
            ? sortingDirection === 1
                ? 'sort-down'
                : 'sort-up'
            : 'sort'
    }

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
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

export const RecipeListData = compose(
    _RecipeListData,
    connect(mapStateToProps)
)

RecipeListData.propTypes = {
    recipeId: PropTypes.string,
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
