import {ErrorMessage} from 'widget/form'
import {connect, select} from 'store'
import {msg} from 'translate'
import ComboBox from 'widget/comboBox'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class RecipeSection extends React.Component {
    render() {
        const {recipes, recipe} = this.props
        const options = recipes.map(recipe => ({
            value: recipe.id,
            label: recipe.name
        }))
        return (
            <React.Fragment>
                <Label msg={msg('process.changeDetection.panel.source.form.recipe.label')}/>
                <ComboBox
                    input={recipe}
                    placeholder={msg('process.changeDetection.panel.source.form.recipe.placeholder')}
                    options={options}
                    autoFocus={true}/>
                <ErrorMessage for={recipe}/>
            </React.Fragment>
        )
    }
}

RecipeSection.propTypes = {
    recipe: PropTypes.object.isRequired,
    recipes: PropTypes.array
}

export default connect(mapStateToProps)(RecipeSection)
