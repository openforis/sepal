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
        all: false,
        result: undefined
    }
    cancel$ = new Subject()

    shouldComponentUpdate() {
        return true
    }

    render() {
        const {stream, input, label, labelButtons, placeholder, autoFocus, onChange} = this.props
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
                options={options}
                autoFocus={autoFocus}
                buttons={buttons}
                busyMessage={stream('LOAD_RECIPE').active}
                onChange={({value}) => {
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
        const {projectId, projects, recipes, filter} = this.props
        const {all} = this.state
        const filteredRecipes = recipes
            .map(recipe => ({...recipe, projectId: recipe.projectId || ''}))
            .filter(recipe => !this.isOwnRecipe(recipe.id))
            .filter(recipe => {
                const {projectId: p, type} = recipe
                const recipeType = getRecipeType(type)
                return all || (p === projectId || (!p && !projectId))
                   && (filter && recipeType ? filter(recipeType, recipe) : true)
            })
        const groups = _.groupBy(filteredRecipes, 'projectId')
        const options = Object.keys(groups)
            .map(projectId => {
                const project = projects.find(({id}) => id === projectId)
                const group = project
                    ? project.name
                    : msg('process.project.noProjectOption')
                return {
                    label: group,
                    filterOptions: isMatchingGroup => !isMatchingGroup,
                    options: groups[projectId]
                        .map(recipe => ({
                            value: recipe.id,
                            label: recipe.name
                        }))
                }
            })
        return _.sortBy(options, 'label')
    }

    // A recipe saved before this rule can still name itself. The value is left exactly as it was saved -
    // rewriting a model the user has not touched is not this component's to do - so the form is told the
    // field is invalid instead. Refusing to load is not enough on its own: a field validated only for being
    // non-blank, as several of these are, would go on satisfying Apply with a reference nothing can
    // resolve. Choosing another recipe clears it, because setting a value clears that field's errors.
    loadRecipe(recipeId) {
        const {input, stream, onError, onLoading, onLoaded, loadRecipe$} = this.props
        this.cancel$.next()
        if (recipeId) {
            onLoading && onLoading(recipeId)
            if (this.isOwnRecipe(recipeId)) {
                input.setInvalid(msg('widget.recipeInput.ownRecipe.invalid'))
                onError && onError(new Error(`Recipe ${recipeId} cannot be an input to itself`))
                return
            }
            stream('LOAD_RECIPE',
                loadRecipe$(recipeId).pipe(
                    switchMap(recipe => {
                        return api.gee.bands$({recipe}).pipe(
                            map(bandNames => ({
                                recipe,
                                bandNames,
                                type: getRecipeType(recipe.type)
                            }))
                        )
                    }
                    )
                ).pipe(
                    takeUntil(this.cancel$)
                ),
                result => {
                    this.setState({result})
                    return onLoaded && onLoaded(result)
                },
                error => onError && onError(error)
            )
        }
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
    filter: PropTypes.func,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    placeholder: PropTypes.string,
    onError: PropTypes.func,
    onChange: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func,
}
