import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'
import {filter, map, Subject, switchMap, takeUntil} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {withSubscriptions} from '~/subscription'
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
import {loadFolders$, loadRecipes$} from '../recipe'
import {getRecipeType, listRecipeTypes} from '../recipeTypeRegistry'
import {Breadcrumb} from './breadcrumb'
import {DropTargetContext} from './dropTargetContext'
import {updateFolder} from './folderActions'
import {FolderForm} from './folderForm'
import {FolderItem} from './folderItem'
import {FolderPicker} from './folderPicker'
import {RecipeItem} from './recipeItem'
import {RecipeListConfirm} from './recipeListConfirm'
import {canDropInto, childFolders, folderCounts, folderPathLabel, folderRecipes, ROOT, searchTree} from './recipeTree'

const EMPTY_ARRAY = []

const mapStateToProps = () => ({
    folders: select('process.folders') ?? EMPTY_ARRAY,
    folderId: select('process.folderId'),
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
        folders ? msg('process.folder.folderCount', {count: folders}) : null,
        recipes ? msg('process.folder.description', {count: recipes}) : null
    ].filter(part => part)
    return parts.length === 2
        ? msg('process.folder.remove.notEmpty.and', {a: parts[0], b: parts[1]})
        : parts[0]
}

const notEmptyMessage = (name, counts) =>
    msg('process.folder.remove.notEmpty', {name, counts: notEmptyCounts(counts)})

const getItems = memoizeOne((folders, recipes, folderId, filterValues, sortingOrder, sortingDirection) => {
    const searching = filterValues.length > 0
    const matched = searching ? searchTree({folders, recipes, filterValues, folderId}) : null
    const shown = matched ? matched.folders : childFolders(folders, folderId)
    const found = matched ? matched.recipes : folderRecipes(recipes, folderId)
    const sorted = _.orderBy(
        found,
        recipe => sortingOrder === 'name' ? recipe.name.toUpperCase() : recipe.updateTime,
        sortingDirection === 1 ? 'asc' : 'desc'
    )
    return [
        ...shown.map(folder => ({kind: 'folder', id: folder.id, folder})),
        ...sorted.map(recipe => ({kind: 'recipe', id: recipe.id, recipe}))
    ]
})

class _RecipeList extends React.Component {
    drag$ = new Subject()

    state = {
        edit: false,
        move: false,
        remove: false,
        editFolder: null,
        preselectedIds: null,
        confirmedIds: null,
        navigationCount: 0,
        dropTarget: null
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

    componentDidMount() {
        const {addSubscription} = this.props
        const release$ = this.drag$.pipe(filter(({dragging}) => dragging === false))
        addSubscription(
            this.drag$.pipe(
                filter(({dragging}) => dragging === true),
                switchMap(({value}) => {
                    this.dragged = value
                    return this.drag$.pipe(
                        takeUntil(release$),
                        map(({coords}) => coords ? this.validTargetAt(coords) : null)
                    )
                })
            ).subscribe(dropTarget => this.setState({dropTarget})),
            release$.subscribe(() => this.drop())
        )
    }

    // The dragged copy of the row ignores the pointer, so what lies under it is the row itself.
    validTargetAt({x, y}) {
        const {folders} = this.props
        const element = document.elementFromPoint(x, y)?.closest('[data-drop-folder-id], [data-drop-home]')
        if (!element) {
            return null
        }
        const folderId = element.hasAttribute('data-drop-home')
            ? ROOT
            : element.getAttribute('data-drop-folder-id')
        return canDropInto({folders, dragged: this.dragged, targetFolderId: folderId})
            ? {folderId}
            : null
    }

    drop() {
        const {onMove} = this.props
        const {dropTarget} = this.state
        const dragged = this.dragged
        this.dragged = null
        this.setState({dropTarget: null})
        if (dragged && dropTarget) {
            if (dragged.kind === 'recipe') {
                onMove([dragged.id], dropTarget.folderId)
            } else {
                updateFolder({...dragged.folder, parentId: dropTarget.folderId})
            }
        }
    }

    renderList() {
        const {edit, move, remove, editFolder, dropTarget} = this.state
        const items = this.getItems()
        const highlightKey = this.getHighlightMatcher().toString()
        // FastList rows are pure and the derived items are referentially stable across a selection
        // change, so anything that alters how a row draws has to reach it through the key.
        const selectedIds = edit ? this.getFilteredSelectedIds() : EMPTY_ARRAY
        const itemKey = item => `${item.kind}|${item.id}|${edit}|${selectedIds.includes(item.id)}|${highlightKey}`
        return (
            // The target reaches the rows through the context rather than through itemKey: a key change
            // makes a new row, and a new dragged row would end the drag it is in the middle of.
            <DropTargetContext.Provider value={dropTarget}>
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
            </DropTargetContext.Provider>
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
        const {folders, recipes, folderId, filterValues, sortingOrder, sortingDirection} = this.props
        return getItems(folders, recipes ?? EMPTY_ARRAY, folderId ?? ROOT,
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
        const {folders, folderId} = this.props
        return (
            <Layout type='horizontal' spacing='compact'>
                <Breadcrumb
                    folders={folders}
                    folderId={folderId ?? ROOT}
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
                label={msg('process.folder.add')}
                onClick={() => this.editFolder({id: uuid(), name: '', parentId: this.props.folderId ?? ROOT})}
            />
        )
    }

    editFolder(folder) {
        this.setState({editFolder: folder})
    }

    renderFolderForm() {
        const {folders} = this.props
        const {editFolder} = this.state
        // A folder being created lands where you already are, so there is nothing to choose. Only an
        // existing folder offers a parent, which is how it gets moved.
        const existing = folders.some(({id}) => id === editFolder.id)
        return (
            <FolderForm
                folder={editFolder}
                folders={folders}
                parentEditable={existing}
                folderNames={folders.filter(({id}) => id !== editFolder.id).map(({name}) => name.toLowerCase())}
                onApply={folder => {
                    updateFolder({...editFolder, ...folder})
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
                        folders={this.props.folders}
                        onSelect={folderId => {
                            this.setMove({
                                folderId: folderId,
                                folderName: folderId
                                    ? folderPathLabel(this.props.folders, folderId)
                                    : msg('process.folder.parent.root')
                            })
                            onBlur()
                        }}
                    />
                )}
            </ButtonPopup>
        )
    }

    renderMoveConfirmation() {
        const {move: {folderId, folderName}, confirmedIds} = this.state
        const selected = confirmedIds?.length
        return (
            <Confirm
                title={msg('process.recipe.move.title')}
                message={msg('process.recipe.move.confirm', {count: selected, folder: folderName})}
                disabled={!selected}
                onConfirm={() => this.moveSelected(folderId)}
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
        const {folders, recipes, folderId, filterValues} = this.props
        const {edit} = this.state
        if (item.kind === 'folder') {
            return (
                <FolderItem
                    folder={item.folder}
                    counts={folderCounts(folders, recipes, item.folder.id)}
                    highlight={this.getHighlightMatcher()}
                    hovered={hovered}
                    drag$={edit ? null : this.drag$}
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
                    path={filterValues.length ? folderPathLabel(folders, item.recipe.folderId, folderId ?? ROOT) : ''}
                    highlight={this.getHighlightMatcher()}
                    hovered={hovered}
                    edit={edit}
                    drag$={edit ? null : this.drag$}
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
        folderId ? builder.set('process.folderId', folderId) : builder.del('process.folderId')
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
        const {folders, recipes} = this.props
        const counts = folderCounts(folders, recipes, folder.id)
        if (counts.folders || counts.recipes) {
            Notifications.warning({message: notEmptyMessage(folder.name, counts)})
        } else {
            this.props.stream('REMOVE_FOLDER',
                api.folder.remove$(folder.id),
                folders => actionBuilder('REMOVE_FOLDER', {folder})
                    .set('process.folders', folders)
                    .dispatch(),
                error => {
                    const refusal = error.response?.code === 'FOLDER_NOT_EMPTY' ? error.response : null
                    if (refusal) {
                        Notifications.warning({message: notEmptyMessage(folder.name, refusal)})
                        // The refusal means our copy of the tree disagrees with the server's; refresh
                        // both so the next attempt (and the counts shown meanwhile) reflect reality.
                        this.props.stream('LOAD_FOLDERS', loadFolders$())
                        this.props.stream('LOAD_RECIPES', loadRecipes$())
                    } else {
                        Notifications.error({message: msg('process.folder.remove.error'), error})
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

    moveSelected(folderId) {
        const {onMove} = this.props
        const {confirmedIds} = this.state
        onMove(confirmedIds, folderId)
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
    connect(mapStateToProps),
    withSubscriptions()
)

RecipeList.propTypes = {
    recipeId: PropTypes.string,
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
