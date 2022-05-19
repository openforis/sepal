import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from 'app/home/map/mapContext'
import PropTypes from 'prop-types'
import React from 'react'

class _SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.changeAlerts.panel.reference.recipe.label')
            },
            {
                value: 'ASSET',
                label: msg('process.changeAlerts.panel.reference.asset.label')
            }
        ]
        return (
            <Form.Buttons
                look='transparent'
                shape='pill'
                layout='vertical'
                alignment='fill'
                air='more'
                input={section}
                options={options}/>
        )
    }
}

export const SectionSelection = compose(
    _SectionSelection,
    withMap()
)

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}
