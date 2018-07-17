import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import {Msg} from 'translate'
import ComboBox from 'widget/comboBox'
import {ErrorMessage} from 'widget/form'
import {msg} from 'translate'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    render() {
        const {recipes, inputs: {recipe}} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <React.Fragment>
                <label><Msg id='process.classification.panel.source.form.recipe.label'/></label>
                <ComboBox
                    input={recipe}
                    placeholder={msg('process.classification.panel.source.form.recipe.placeholder')}
                    options={options}
                    autoFocus={true}/>
                <ErrorMessage for={recipe}/>
            </React.Fragment>
        )
    }
}

RecipeSection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired
}

export default connect(mapStateToProps)(RecipeSection)

RecipeSection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired
}