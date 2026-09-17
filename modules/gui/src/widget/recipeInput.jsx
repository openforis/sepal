import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {map, Subject, switchMap, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'

import {Form} from './form'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes'),
        projects: select('process.projects')
    }
}

const mapRecipeToProps = recipe => {
    return ({
        projectId: recipe.projectId
    })
}

class _RecipeInput extends React.Component {
    state = {
        all: false
    }
    cancel$ = new Subject()

    shouldComponentUpdate() {
        return true
    }

    render() {
        const {
            stream, input, label, labelButtons, placeholder, tooltip, allowClear, autoFocus,
            busyMessage, errorMessage, warningMessage, onChange
        } = this.props
        const {all} = this.state
        const options = this.getOptions()

        const buttons = [
            <Buttons
                key={'inverted'}
                selected={[all]}
                look='transparent'
                shape={'pill'}
                air={'less'}
                size={'x-small'}
                options={[
                    {value: true, label: 'ALL', tooltip: msg('widget.recipeInput.all.tooltip')}
                ]}
                multiple
                tabIndex={-1}
                onChange={() => {
                    this.setState({all: !all})
                }}
            />
        ]
        
        return (
            <Form.Combo
                input={input}
                label={label || msg('widget.recipeInput.label')}
                labelButtons={labelButtons}
                placeholder={placeholder || msg('widget.recipeInput.placeholder')}
                tooltip={tooltip}
                options={options}
                autoFocus={autoFocus}
                allowClear={allowClear}
                buttons={buttons}
                busyMessage={stream('LOAD_RECIPE').active || busyMessage}
                errorMessage={errorMessage}
                warningMessage={warningMessage}
                onChange={option => {
                    const value = option?.value
                    onChange && onChange(value)
                    this.loadRecipe(value)
                }}
            />
        )
    }

    componentDidMount() {
        const {input} = this.props
        if (input.value) {
            this.loadRecipe(input.value)
        }
    }

    // A recipe cannot be an input to itself: the reference closes a cycle the moment it is made, and the
    // resolver rejects one. Identity is the recipe's id - a title is neither stable nor unique, and the
    // catalogue summary is a different object from the recipe being edited. What opts out is any selection
    // that does not become a dependency edge - see allowOwnRecipe.
    isOwnRecipe(recipeId) {
        const {recipeId: ownRecipeId, allowOwnRecipe} = this.props
        return !allowOwnRecipe && !!ownRecipeId && recipeId === ownRecipeId
    }

    getOptions() {
        const groups = _.groupBy(this.offeredRecipes(), 'projectId')
        return this.orderedProjects(Object.keys(groups))
            .map(({id, project}) => ({
                // Prefixed so no id can be mistaken for the unfiled group's empty one, and identified by id
                // rather than by name: groups sharing a heading would otherwise be one group, and leaving
                // the view one belongs to would leave its heading behind.
                key: `project:${id}`,
                label: project ? project.name : msg('process.project.noProjectOption'),
                filterOptions: isMatchingGroup => !isMatchingGroup,
                options: groups[id].map(recipe => ({value: recipe.id, label: recipe.name}))
            }))
    }

    // ALL widens which projects are offered, never what the caller can use.
    offeredRecipes() {
        const {projectId, recipes, filter} = this.props
        const {all} = this.state
        return recipes
            .map(recipe => ({...recipe, projectId: recipe.projectId || ''}))
            .filter(recipe => !this.isOwnRecipe(recipe.id))
            .filter(recipe => {
                const recipeType = getRecipeType(recipe.type)
                return filter && recipeType ? filter(recipeType, recipe) : true
            })
            .filter(({projectId: p}) => all || p === projectId || (!p && !projectId))
    }

    orderedProjects(ids) {
        const {projects} = this.props
        return _.sortBy(
            ids.map(id => ({id, project: projects.find(project => project.id === id)})),
            [({project}) => project ? 1 : 0, ({project}) => project?.name?.toLowerCase(), 'id']
        )
    }

    // A recipe saved before this rule can still name itself. The value is left exactly as it was saved -
    // rewriting a model the user has not touched is not this component's to do - so the form is told the
    // field is invalid instead. Refusing to load is not enough on its own: a field validated only for being
    // non-blank, as several of these are, would go on satisfying Apply with a reference nothing can
    // resolve. Choosing another recipe clears it, because setting a value clears that field's errors.
    loadRecipe(recipeId) {
        const {input, stream, onError, onLoading, onRecipeLoaded, onBandsLoaded} = this.props
        // Whatever a previous selection had in flight can no longer be about what is selected now.
        this.cancel$.next()
        if (!recipeId) {
            return
        }
        // Validation is not acquisition: a saved self-reference is refused whether or not anything is read.
        if (this.isOwnRecipe(recipeId)) {
            input.setInvalid(msg('widget.recipeInput.ownRecipe.invalid'))
            onError && onError(new Error(`Recipe ${recipeId} cannot be an input to itself`))
            return
        }
        // What is read is what a consumer asked to be given. A caller that only needs to know what was
        // selected reads nothing, and one that never asks for bands never reaches Earth Engine.
        if (!onRecipeLoaded && !onBandsLoaded) {
            return
        }
        onLoading && onLoading(recipeId)
        stream('LOAD_RECIPE',
            this.result$(recipeId).pipe(takeUntil(this.cancel$)),
            ({recipe, bandNames}) => {
                const type = getRecipeType(recipe.type)
                onRecipeLoaded && onRecipeLoaded({recipe, type})
                onBandsLoaded && onBandsLoaded({recipe, type, bandNames})
            },
            error => onError && onError(error)
        )
    }

    // One record read, whichever results were asked for.
    result$(recipeId) {
        const {onBandsLoaded, loadRecipe$} = this.props
        const record$ = loadRecipe$(recipeId)
        return onBandsLoaded
            ? record$.pipe(switchMap(recipe =>
                api.gee.bands$({recipe}).pipe(map(bandNames => ({recipe, bandNames})))))
            : record$.pipe(map(recipe => ({recipe})))
    }
}

export const RecipeInput = compose(
    _RecipeInput,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    recipeAccess(),
)

RecipeInput.propTypes = {
    input: PropTypes.object.isRequired,
    // For the selections that do NOT become a dependency edge, where naming this recipe closes no cycle:
    // a Map Layers layer, which displays a recipe rather than consuming one, and the training-data
    // samplers, which read the selected recipe once and persist the points (the recipe definitions leave
    // their `recipeIdToSample` out of directSources for exactly that reason). Never set it on an input
    // execution resolves.
    allowOwnRecipe: PropTypes.bool,
    allowClear: PropTypes.bool,
    busyMessage: PropTypes.any,
    errorMessage: PropTypes.any,
    filter: PropTypes.func,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any,
    warningMessage: PropTypes.any,
    // What a consumer asks to be given decides what is read. Neither reads nothing; both share one record
    // read, and only onBandsLoaded reaches Earth Engine.
    onBandsLoaded: PropTypes.func,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    onLoading: PropTypes.func,
    onRecipeLoaded: PropTypes.func,
}
