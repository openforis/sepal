import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    render() {
        const {recipes, inputs: {name, recipe}} = this.props
        const options = recipes
            .filter(({type}) => type === 'CLASSIFICATION')
            .map(recipe => ({
                value: recipe.id,
                label: recipe.name
            }))

        const getName = recipeId => {
            const recipe = recipes.find(({id}) => id === recipeId)
            return recipe && recipe.name
        }
        return (
            <Form.Combo
                label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                input={recipe}
                placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                options={options}
                onChange={option => name.set(getName(option.value))}
                autoFocus
                errorMessage
            />
        )
    }

    // TODO: Should do some validation of the bands. Use a separate input for that?
}

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipes: PropTypes.array
}

export default compose(
    RecipeSection,
    connect(mapStateToProps)
)
