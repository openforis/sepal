import {Buttons} from 'widget/buttons'
import {Form} from './form/form'
import {Subject, map, switchMap, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {msg} from 'translate'
import {recipeAccess} from 'app/home/body/process/recipeAccess'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

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
        const {stream, input, label, placeholder, autoFocus} = this.props
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
                placeholder={placeholder || msg('widget.recipeInput.placeholder')}
                options={options}
                autoFocus={autoFocus}
                buttons={buttons}
                errorMessage
                matchGroups
                busyMessage={stream('LOAD_RECIPE').active}
                onChange={({value}) => this.loadRecipe(value)}
            />
        )
    }

    componentDidMount() {
        const {input} = this.props
        if (input.value) {
            this.loadRecipe(input.value)
        }
    }

    getOptions() {
        const {projectId, projects, recipes, filter} = this.props
        const {all} = this.state
        const filteredRecipes = recipes
            .map(recipe => ({...recipe, projectId: recipe.projectId || ''}))
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
                    options: groups[projectId]
                        .map(recipe => ({
                            value: recipe.id,
                            label: recipe.name
                        }))
                }
            })
        return _.sortBy(options, 'label')
    }

    loadRecipe(recipeId) {
        const {stream, onError, onLoading, onLoaded, loadRecipe$} = this.props
        this.cancel$.next()
        if (recipeId) {
            onLoading && onLoading(recipeId)
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
    filter: PropTypes.func,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func,
}
