import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import Combo from 'widget/combo'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    render() {
        const {recipes, input, onChange} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <Combo
                label={msg('process.classification.panel.inputImagery.form.recipe.label')}
                input={input}
                placeholder={msg('process.classification.panel.inputImagery.form.recipe.placeholder')}
                options={options}
                autoFocus
                onChange={option => onChange(option.value)}
                errorMessage
            />
        )
    }
}

RecipeSection.propTypes = {
    input: PropTypes.object.isRequired,
    recipes: PropTypes.array
}

export default compose(
    RecipeSection,
    connect(mapStateToProps)
)
