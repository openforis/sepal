import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {ButtonPopup} from '~/widget/buttonPopup'
import {CheckButton} from '~/widget/checkButton'
import {Confirm} from '~/widget/confirm'
import {FastList} from '~/widget/fastList'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {CenteredProgress} from '~/widget/progress'
import {SearchBox} from '~/widget/searchBox'
import {SortButtons} from '~/widget/sortButtons'

import {CreateRecipe} from '../createRecipe'
import {loadProjects$, loadRecipes$} from '../recipe'
import {getRecipeType, listRecipeTypes} from '../recipeTypeRegistry'
import {Breadcrumb} from './breadcrumb'
import {FolderItem} from './folderItem'
import {FolderPicker} from './folderPicker'
import {Project} from './project'
import {updateProject} from './projectActions'
import {RecipeItem} from './recipeItem'
import {RecipeListConfirm} from './recipeListConfirm'
import {childFolders, folderCounts, folderPathLabel, folderRecipes, ROOT, searchTree} from './recipeTree'

const EMPTY_ARRAY = []

const mapStateToProps = () => ({
    projects: select('process.projects') ?? EMPTY_ARRAY,
    projectId: select('process.projectId'),
    recipes: select('process.recipes'),
    sortingOrder: select('process.sortingOrder') ?? 'updateTime',
    sortingDirection: select('process.sortingDirection') ?? -1,
    filterValue: select('process.filterValue'),
    filterValues: select('process.filterValues') ?? EMPTY_ARRAY,
    selectedIds: select('process.selectedIds') ?? EMPTY_ARRAY
})

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

// Called only when at least one count is nonzero, so `parts` is never empty.
const notEmptyCounts = ({folders, recipes}) => {
    const parts = [
        folders ? msg('process.project.folderCount', {count: folders}) : null,
        recipes ? msg('process.project.description', {count: recipes}) : null
    ].filter(part => part)
    return parts.length === 2
        ? msg('process.project.remove.notEmpty.and', {a: parts[0], b: parts[1]})
        : parts[0]
}

const notEmptyMessage = (name, counts) =>
    msg('process.project.remove.notEmpty', {name, counts: notEmptyCounts(counts)})

const getItems = memoizeOne((projects, recipes, folderId, filterValues, sortingOrder, sortingDirection) => {
    const searching = filterValues.length > 0
    const matched = searching ? searchTree({projects, recipes, filterValues, folderId}) : null
    const folders = matched ? matched.folders : childFolders(projects, folderId)
    const found = matched ? matched.recipes : folderRecipes(recipes, folderId)
    const sorted = _.orderBy(
        found,
        recipe => sortingOrder === 'name' ? recipe.name.toUpperCase() : recipe.updateTime,
        sortingDirection === 1 ? 'asc' : 'desc'
    )
    return [
        ...folders.map(folder => ({kind: 'folder', id: folder.id, folder})),
        ...sorted.map(recipe => ({kind: 'recipe', id: recipe.id, recipe}))
    ]
})

class _RecipeList extends React.Component {
    state = {
        edit: false,
        move: false,
        remove: false,
        editFolder: null,
        preselectedIds: null,
        confirmedIds: null,
        navigationCount: 0
    }

    constructor() {
        super()
        this.renderItem = this.renderItem.bind(this)
        this.toggleEdit = this.toggleEdit.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.toggleAll = this.toggleAll.bind(this)
        this.moveSelected = this.moveSelected.bind(this)
        this.removeSelected = this.removeSelected.bind(this)
        this.toggleConfirmed = this.toggleConfirmed.bind(this)
        this.setSorting = this.setSorting.bind(this)
        this.handleClick = this.handleClick.bind(this)
    }

    render() {
        return this.isLoading()
            ? this.renderProgress()
            : this.renderList()
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderList() {
        const {edit, move, remove, editFolder} = this.state
        const items = this.getItems()
        const highlightKey = this.getHighlightMatcher().toString()
        // FastList rows are pure and the derived items are referentially stable across a selection
        // change, so anything that alters how a row draws has to reach it through the key.
        const selectedIds = edit ? this.getFilteredSelectedIds() : EMPTY_ARRAY
        const itemKey = item => `${item.kind}|${item.id}|${edit}|${selectedIds.includes(item.id)}|${highlightKey}`
        return (
            <Layout type='vertical' spacing='compact'>
                {this.renderHeader1()}
                {this.renderHeader2()}
                {items.length
                    ? (
                        <FastList
                            items={items}
                            itemKey={itemKey}
                            itemRenderer={this.renderItem}
                            spacing='tight'
                            overflow={50}
                            onEnter={item => item.kind === 'folder'
                                ? this.navigateTo(item.folder.id)
                                : this.handleClick(item.recipe)}
                        />
                    )
                    : this.renderEmpty()}
                {move && this.renderMoveConfirmation()}
                {remove && this.renderRemoveConfirmation()}
                {editFolder && this.renderFolderForm()}
            </Layout>
        )
    }

    // An empty list is silent about why. Say whether nothing matched or the folder simply holds nothing.
    renderEmpty() {
        const {filterValue, filterValues} = this.props
        return (
            <NoData message={filterValues.length
                ? msg('process.recipeList.noMatch', {search: filterValue})
                : msg('process.recipeList.empty')}/>
        )
    }

    getItems() {
        const {projects, recipes, projectId, filterValues, sortingOrder, sortingDirection} = this.props
        return getItems(projects, recipes ?? EMPTY_ARRAY, projectId ?? ROOT,
            filterValues, sortingOrder, sortingDirection)
    }

    renderHeader1() {
        const {recipeId} = this.props
        return (
            <Layout type='horizontal' spacing='compact'>
                {this.renderSearch()}
                <CreateRecipe recipeId={recipeId} recipeTypes={listRecipeTypes()}/>
                {this.renderNewFolderButton()}
                <Layout.Spacer/>
                {this.renderEditButtons()}
            </Layout>
        )
    }

    renderHeader2() {
        const {projects, projectId} = this.props
        return (
            <Layout type='horizontal' spacing='compact'>
                <Breadcrumb
                    projects={projects}
                    folderId={projectId ?? ROOT}
                    onNavigate={folderId => this.navigateTo(folderId)}
                />
                <Layout.Spacer/>
                <Layout type='horizontal' spacing='compact' alignment='right'>
                    {this.renderSortButtons()}
                </Layout>
            </Layout>
        )
    }

    renderNewFolderButton() {
        return (
            <Button
                look='default'
                shape='pill'
                icon='folder-plus'
                label={msg('process.project.add')}
                onClick={() => this.editFolder({id: uuid(), name: '', parentId: this.props.projectId ?? ROOT})}
            />
        )
    }

    editFolder(folder) {
        this.setState({editFolder: folder})
    }

    renderFolderForm() {
        const {projects} = this.props
        const {editFolder} = this.state
        // A folder being created lands where you already are, so there is nothing to choose. Only an
        // existing folder offers a parent, which is how it gets moved.
        const existing = projects.some(({id}) => id === editFolder.id)
        return (
            <Project
                project={editFolder}
                projects={projects}
                parentEditable={existing}
                projectNames={projects.filter(({id}) => id !== editFolder.id).map(({name}) => name.toLowerCase())}
                onApply={folder => {
                    updateProject({...editFolder, ...folder})
                    this.editFolder(null)
                }}
                onCancel={() => this.editFolder(null)}
            />
        )
    }

    // SearchBox seeds its value on mount only, so a navigation that clears the filter reaches the box
    // by remounting it. The key counts navigations rather than naming the folder, so navigating to the
    // folder you are already in still clears it.
    renderSearch() {
        const {filterValue} = this.props
        const {navigationCount} = this.state
        return (
            <SearchBox
                key={navigationCount}
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
                    look={edit ? 'apply' : 'default'}
                    icon={edit ? 'xmark' : 'pen-to-square'}
                    label={msg('process.recipe.edit.label')}
                    shape='pill'
                    keybinding={edit ? 'Escape' : ''}
                    disabled={!this.hasData()}
                    onClick={this.toggleEdit}
                />
            </ButtonGroup>
        )
    }

    toggleEdit() {
        this.setState(({edit}) => ({edit: !edit}))
        this.unselectAll()
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
                vPlacement='below'
                hPlacement='over-right'
                disabled={!this.isSelected()}
                tooltip={msg('process.recipe.move.tooltip')}>
                {onBlur => (
                    <FolderPicker
                        projects={this.props.projects}
                        onSelect={folderId => {
                            this.setMove({
                                projectId: folderId,
                                projectName: folderId
                                    ? folderPathLabel(this.props.projects, folderId)
                                    : msg('process.project.parent.root')
                            })
                            onBlur()
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderMoveConfirmation() {
        const {move: {projectId, projectName}, confirmedIds} = this.state
        const selected = confirmedIds?.length
        return (
            <Confirm
                title={msg('process.recipe.move.title')}
                message={msg('process.recipe.move.confirm', {count: selected, project: projectName})}
                disabled={!selected}
                onConfirm={() => this.moveSelected(projectId)}
                onCancel={() => this.setMove(false)}>
                <RecipeListConfirm
                    recipes={this.getFilteredPreselectedIds()}
                    isSelected={recipeId => this.isConfirmed(recipeId)}
                    onSelect={recipeId => this.toggleConfirmed(recipeId)}
                />
            </Confirm>
        )
    }

    renderRemoveButton() {
        return (
            <Button
                shape='pill'
                icon='trash'
                label={msg('process.recipe.remove.label')}
                tooltip={msg('process.recipe.remove.tooltip')}
                disabled={!this.isSelected()}
                onClick={() => this.setRemove(true)}
            />
        )
    }

    renderRemoveConfirmation() {
        const {confirmedIds} = this.state
        const selected = confirmedIds?.length
        return (
            <Confirm
                title={msg('process.recipe.remove.title')}
                message={msg('process.recipe.remove.confirm', {count: selected})}
                disabled={!selected}
                onConfirm={() => this.removeSelected()}
                onCancel={() => this.setRemove(false)}>
                <RecipeListConfirm
                    recipes={this.getFilteredPreselectedIds()}
                    isSelected={recipeId => this.isConfirmed(recipeId)}
                    onSelect={recipeId => this.toggleConfirmed(recipeId)}
                />
            </Confirm>
        )
    }

    getHighlightMatcher() {
        const {filterValues} = this.props
        return getHighlightMatcher(filterValues)
    }

    getFilteredPreselectedIds() {
        const {preselectedIds} = this.state
        return this.getVisibleRecipes().filter(({id}) => preselectedIds.includes(id))
    }

    renderSortButtons() {
        const {sortingOrder, sortingDirection} = this.props
        return (
            <SortButtons
                labels={{
                    updateTime: msg('process.recipe.lastUpdate'),
                    name: msg('process.recipe.name'),
                }}
                sortingOrder={sortingOrder}
                sortingDirection={sortingDirection}
                onChange={this.setSorting}
            />
        )
    }

    renderItem(item, hovered) {
        const {projects, recipes, projectId, filterValues} = this.props
        const {edit} = this.state
        if (item.kind === 'folder') {
            return (
                <FolderItem
                    folder={item.folder}
                    counts={folderCounts(projects, recipes, item.folder.id)}
                    highlight={this.getHighlightMatcher()}
                    hovered={hovered}
                    onClick={folder => this.navigateTo(folder.id)}
                    onEdit={folder => this.editFolder(folder)}
                    onRemove={folder => this.removeFolder(folder)}
                />
            )
        } else {
            const {onDuplicate, onRemove} = this.props
            return (
                <RecipeItem
                    recipe={item.recipe}
                    typeName={this.getRecipeTypeName(item.recipe.type)}
                    path={filterValues.length ? folderPathLabel(projects, item.recipe.projectId, projectId ?? ROOT) : ''}
                    highlight={this.getHighlightMatcher()}
                    hovered={hovered}
                    edit={edit}
                    selected={this.isSelected(item.recipe.id)}
                    onClick={recipe => this.handleClick(recipe)}
                    onSelect={recipeId => this.toggleOne(recipeId)}
                    onDuplicate={onDuplicate}
                    onRemove={onRemove}
                />
            )
        }
    }

    handleClick(recipe) {
        const {onClick} = this.props
        onClick && onClick(recipe.id)
    }

    // Navigating answers where you asked to go, so a search that took you here has done its job.
    navigateTo(folderId) {
        const builder = actionBuilder('NAVIGATE_TO_FOLDER', {folderId})
        folderId ? builder.set('process.projectId', folderId) : builder.del('process.projectId')
        builder
            .set('process.filterValue', '')
            .set('process.filterValues', [])
            .dispatch()
        this.setState(({navigationCount}) => ({navigationCount: navigationCount + 1}))
        this.unselectAll()
    }

    setMove(move) {
        const filteredSelectedIds = this.getFilteredSelectedIds()
        if (move) {
            this.setState({move, preselectedIds: filteredSelectedIds, confirmedIds: filteredSelectedIds})
        } else {
            this.setState({move: false, preselectedIds: null, confirmedIds: null})
        }
    }
    
    setRemove(remove) {
        const filteredSelectedIds = this.getFilteredSelectedIds()
        if (remove) {
            this.setState({remove, preselectedIds: filteredSelectedIds, confirmedIds: filteredSelectedIds})
        } else {
            this.setState({remove: false, preselectedIds: null, confirmedIds: null})
        }
    }

    // folderCounts counts direct children only, same as the server's own check.
    removeFolder(folder) {
        const {projects, recipes} = this.props
        const counts = folderCounts(projects, recipes, folder.id)
        if (counts.folders || counts.recipes) {
            Notifications.warning({message: notEmptyMessage(folder.name, counts)})
        } else {
            this.props.stream('REMOVE_PROJECT',
                api.project.remove$(folder.id),
                projects => actionBuilder('REMOVE_PROJECT', {folder})
                    .set('process.projects', projects)
                    .dispatch(),
                error => {
                    const refusal = error.response?.code === 'PROJECT_NOT_EMPTY' ? error.response : null
                    if (refusal) {
                        Notifications.warning({message: notEmptyMessage(folder.name, refusal)})
                        // The refusal means our copy of the tree disagrees with the server's; refresh
                        // both so the next attempt (and the counts shown meanwhile) reflect reality.
                        this.props.stream('LOAD_PROJECTS', loadProjects$())
                        this.props.stream('LOAD_RECIPES', loadRecipes$())
                    } else {
                        Notifications.error({message: msg('process.project.remove.error'), error})
                    }
                }
            )
        }
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
        const {recipes} = this.props
        return _.isUndefined(recipes)
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

    setSorting(sortingOrder, sortingDirection) {
        actionBuilder('SET_SORTING_ORDER', {sortingOrder, sortingDirection})
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
        const {selectedIds: prevSelectedIds} = this.props
        if (selectedIds.length !== prevSelectedIds.length || !_.isEqual(selectedIds, prevSelectedIds)) {
            actionBuilder('SET_SELECTED_IDS', {selectedIds})
                .set(['process.selectedIds'], selectedIds)
                .dispatch()
        }
    }

    isConfirmed(recipeId) {
        const {confirmedIds} = this.state
        return confirmedIds.includes(recipeId)
    }

    toggleConfirmed(recipeId) {
        const {confirmedIds: prevConfirmedIds} = this.state
        const confirmedIds = prevConfirmedIds.includes(recipeId)
            ? prevConfirmedIds.filter(currentRecipeId => currentRecipeId !== recipeId)
            : [...prevConfirmedIds, recipeId]
        this.setState({confirmedIds})
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

    unselectAll() {
        this.setSelectedIds([])
    }

    moveSelected(projectId) {
        const {onMove} = this.props
        const {confirmedIds} = this.state
        onMove(confirmedIds, projectId)
        this.setMove(false)
    }

    removeSelected() {
        const {onRemove} = this.props
        const {confirmedIds} = this.state
        onRemove(confirmedIds)
        this.setRemove(false)
    }

    getVisibleRecipes() {
        return this.getItems().filter(({kind}) => kind === 'recipe').map(({recipe}) => recipe)
    }

    getFilteredIds() {
        return this.getVisibleRecipes().map(({id}) => id)
    }

    getFilteredSelectedIds() {
        const {selectedIds} = this.props
        const filteredSelectedIds = this.getFilteredIds().filter(id => selectedIds.includes(id))
        return filteredSelectedIds
    }

    static getDerivedStateFromProps({recipes}) {
        if (!recipes || !recipes.length) {
            return {
                edit: false
            }
        }
        return {}
    }
}

export const RecipeList = compose(
    _RecipeList,
    connect(mapStateToProps)
)

RecipeList.propTypes = {
    recipeId: PropTypes.string,
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
