import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Panel} from '~/widget/panel/panel'
import {SearchBox} from '~/widget/searchBox'

import {getRecipeType} from '../recipeTypeRegistry'
import {Breadcrumb} from './breadcrumb'
import styles from './recipeBrowser.module.css'
import {PATH_SEPARATOR} from './recipeListConstants'
import {at, folderPathLabel, navigatorItems, searchHighlight, searchValues} from './recipeTree'

const getItems = memoizeOne((folders, recipes, folderId, filterValues) =>
    navigatorItems({folders, recipes, folderId, filterValues})
)

const getHighlight = memoizeOne(searchHighlight)

// The recipe list's way around the folders, for picking one recipe: nothing here edits, moves or
// removes anything, and the list's own place and search are left as they were. It opens over a panel,
// so a row is one line, as in the asset browser.
export class RecipeBrowser extends React.Component {
    constructor(props) {
        super(props)
        this.renderItem = this.renderItem.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.state = {
            folderId: at(props.folderId),
            filterValue: '',
            filterValues: [],
            navigationCount: 0
        }
    }

    render() {
        const {onCancel} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={onCancel}>
                <Panel.Header
                    icon='folder-open'
                    title={msg('widget.recipeInput.browse.title')}/>
                <Panel.Content scrollable={false}>
                    <div className={styles.header}>
                        {this.renderHeader()}
                    </div>
                    {this.renderItems()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={onCancel}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderHeader() {
        const {folders} = this.props
        const {folderId, filterValue, navigationCount} = this.state
        return (
            <Layout type='vertical' spacing='compact' shrink>
                <SearchBox
                    key={navigationCount}
                    value={filterValue}
                    placeholder={msg('process.menu.searchRecipes')}
                    onSearchValue={this.setFilter}
                />
                <Breadcrumb
                    folders={folders}
                    folderId={folderId}
                    onNavigate={folderId => this.navigateTo(folderId)}
                />
            </Layout>
        )
    }

    renderItems() {
        const {onSelect} = this.props
        const {filterValue, filterValues} = this.state
        const items = this.getItems()
        const highlightKey = getHighlight(filterValues).toString()
        return items.length
            ? (
                <FastList
                    items={items}
                    itemKey={item => `${item.kind}|${item.id}|${highlightKey}`}
                    itemRenderer={this.renderItem}
                    spacing='tight'
                    overflow={50}
                    onEnter={item => item.kind === 'folder'
                        ? this.navigateTo(item.folder.id)
                        : onSelect(item.recipe.id)}
                />
            )
            : (
                <NoData message={filterValues.length
                    ? msg('process.recipeList.noMatch', {search: filterValue})
                    : msg('process.recipeList.empty')}/>
            )
    }

    renderItem(item, hovered) {
        return item.kind === 'folder'
            ? this.renderFolder(item.folder, hovered)
            : this.renderRecipe(item.recipe, hovered)
    }

    renderFolder(folder, hovered) {
        const {filterValues} = this.state
        return (
            <ListItem hovered={hovered} onClick={() => this.navigateTo(folder.id)}>
                <CrudItem
                    icon='folder-open'
                    iconVariant='info'
                    description={folder.name}
                    highlight={getHighlight(filterValues)}
                />
            </ListItem>
        )
    }

    // A search reaches below the open folder, so a match says where it is.
    renderRecipe(recipe, hovered) {
        const {folders, onSelect} = this.props
        const {folderId, filterValues} = this.state
        const path = filterValues.length ? folderPathLabel(folders, recipe.folderId, folderId) : ''
        const typeName = getRecipeType(recipe.type)?.labels.name
        return (
            <ListItem hovered={hovered} onClick={() => onSelect(recipe.id)}>
                <CrudItem
                    icon='globe'
                    description={[path, recipe.name].filter(part => part).join(PATH_SEPARATOR)}
                    metadata={typeName && <span className={styles.type}>{typeName}</span>}
                    highlight={getHighlight(filterValues)}
                />
            </ListItem>
        )
    }

    getItems() {
        const {folders, recipes} = this.props
        const {folderId, filterValues} = this.state
        return getItems(folders, recipes, folderId, filterValues)
    }

    // SearchBox seeds its value on mount only, so a navigation that clears the search remounts it.
    navigateTo(folderId) {
        this.setState(({navigationCount}) => ({
            folderId: at(folderId),
            filterValue: '',
            filterValues: [],
            navigationCount: navigationCount + 1
        }))
    }

    setFilter(filterValue) {
        this.setState({filterValue, filterValues: searchValues(filterValue)})
    }
}

RecipeBrowser.propTypes = {
    folders: PropTypes.array.isRequired,
    recipes: PropTypes.array.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    folderId: PropTypes.string
}
