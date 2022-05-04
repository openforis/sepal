import {Buttons} from 'widget/buttons'
import {Form} from './form/form'
import {Subject, switchMap, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect, select} from 'store'
import {getRecipeType} from 'app/home/body/process/recipeTypes'
import {map} from 'rxjs'
import {msg} from 'translate'
import {recipeAccess} from 'app/home/body/process/recipeAccess'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
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

    render() {
        const {projectId, stream, recipes, filter, input, label, placeholder, autoFocus} = this.props
        const {all} = this.state
        const options = recipes
            .filter(recipe => {
                const {projectId: p, type} = recipe
                return (all || p === projectId || (!p && !projectId))
                   && (filter ? filter(getRecipeType(type), recipe) : true)
            })
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))

        const additionalButtons = (
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
        )
        
        return (
            <Form.Combo
                input={input}
                label={label || msg('widget.recipeInput.label')}
                placeholder={placeholder || msg('widget.recipeInput.placeholder')}
                options={options}
                autoFocus={autoFocus}
                additionalButtons={additionalButtons}
                errorMessage
                busyMessage={stream('LOAD_RECIPE').active}
                onChange={({value}) => this.loadRecipe(value)}
            />
        )
    }

    loadRecipe(recipeId) {
        const {stream, onError, onLoading, onLoaded, loadRecipe$} = this.props
        this.cancel$.next()
        if (recipeId) {
            onLoading && onLoading(recipeId)
            stream('LOAD_RECIPE',
                loadRecipe$(recipeId).pipe(
                    switchMap(recipe =>
                        api.gee.bands$({recipe}).pipe(
                            map(bandNames => ({
                                recipe,
                                bandNames,
                                type: getRecipeType(recipe.type)
                            }))
                        )
                    )
                ).pipe(
                    takeUntil(this.cancel$)
                ),
                result => onLoaded(result),
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
