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
import {getRecipeType} from '../recipeTypes'
import {msg} from 'translate'
import {withRecipeListContext} from './recipeListContext'
import ButtonPopup from 'widget/buttonPopup'
import Confirm from 'widget/confirm'
import PropTypes from 'prop-types'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import _ from 'lodash'
import styles from './recipeListData.module.css'

class _RecipeListData extends React.Component {
    state = {
        edit: false,
        move: false
    }

    setEdit(edit) {
        this.setState({edit})
    }

    setMove(move) {
        this.setState({move})
    }

    render() {
        const {recipeListContext: {isLoading}} = this.props
        return isLoading()
            ? this.renderProgress()
            : this.renderData()
    }

    renderProgress() {
        return <CenteredProgress title={msg('process.recipe.loading')}/>
    }

    renderData() {
        const {recipeListContext: {hasData, highlightMatcher}} = this.props
        const {move} = this.state
        return hasData()
            ? (
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
            )
            : null
    }

    renderHeader() {
        const {recipeListContext: {projectId, recipeId}} = this.props
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
        const {recipeListContext: {filterValue, setFilter}} = this.props
        return (
            <SearchBox
                value={filterValue}
                placeholder={msg('process.menu.searchRecipes')}
                onSearchValue={searchValue => setFilter(searchValue)}
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
        const {recipeListContext: {isSelected, toggleAll}} = this.props
        const selected = isSelected()
        return (
            <CheckButton
                shape='pill'
                label={msg('process.recipe.select.label')}
                checked={selected}
                tooltip={msg(selected ? 'process.recipe.select.tooltip.deselect' : 'process.recipe.select.tooltip.select')}
                onToggle={toggleAll}/>
        )
    }

    renderMoveButton() {
        const {recipeListContext: {isSelected, moveSelected}} = this.props
        return moveSelected && (
            <ButtonPopup
                shape='pill'
                icon='shuffle'
                label={msg('process.recipe.move.label')}
                placement='below'
                alignment='left'
                disabled={!isSelected()}
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
        const {recipeListContext: {isSelected, moveSelected}} = this.props
        const {move: {value: projectId, label: projectName}} = this.state
        return moveSelected && (
            <Confirm
                title={msg('process.recipe.move.title')}
                message={msg('process.recipe.move.confirm', {count: isSelected(), project: projectName})}
                onConfirm={() => {
                    this.setMove(false)
                    moveSelected(projectId)
                }}
                onCancel={() => this.setMove(false)}
            />
        )
    }

    renderRemoveButton() {
        const {recipeListContext: {isSelected, removeSelected}} = this.props
        return removeSelected && (
            <RemoveButton
                shape='pill'
                icon='trash'
                label={msg('process.recipe.remove.label')}
                tooltip={msg('process.recipe.remove.tooltip')}
                message={msg('process.recipe.remove.confirm', {count: isSelected()})}
                disabled={!isSelected()}
                onRemove={removeSelected}/>
        )
    }

    getDestinations() {
        const {recipeListContext: {projects}} = this.props
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
        const {recipeListContext: {sortingOrder, sortingDirection, setSorting}} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                shape='pill'
                label={label}
                labelStyle={sortingOrder === column ? 'smallcaps-highlight' : 'smallcaps'}
                icon={this.getHandleIcon({column, sortingOrder, sortingDirection})}
                iconPlacement='right'
                onClick={() => setSorting(column)}/>
        )
    }

    getHandleIcon({column, sortingOrder, sortingDirection}) {
        const sorted = sortingOrder === column
        return sorted
            ? sortingDirection === 1
                ? 'sort-down'
                : 'sort-up'
            : 'sort'
    }

    renderRecipe(recipe, highlightMatcher) {
        const {onClick, onDuplicate, onRemove, recipeListContext: {projects, isSelected, toggleOne}} = this.props
        const {edit} = this.state
        const name = recipe.name
        const project = _.find(projects, ({id}) => id === recipe.projectId)
        const path = `${project ? project.name : '*'} / ${name}`
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
                    selected={isSelected(recipe.id)}
                    onDuplicate={onDuplicate ? () => onDuplicate(recipe.id) : null}
                    onRemove={onRemove ? () => onRemove(recipe.id) : null}
                    onSelect={(edit && toggleOne) ? () => toggleOne(recipe.id) : null}
                />
            </ListItem>
        )
    }

    getRecipeTypeName(type) {
        const recipeType = getRecipeType(type)
        return recipeType && recipeType.labels.name
    }
}

export const RecipeListData = compose(
    _RecipeListData,
    withRecipeListContext()
)

RecipeListData.propTypes = {
    onClick: PropTypes.func,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
