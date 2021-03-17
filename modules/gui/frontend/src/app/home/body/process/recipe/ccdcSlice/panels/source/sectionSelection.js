import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {msg} from 'translate'
import {removeAoiLayer} from 'app/home/map/aoiLayer'
import {withMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'

class _SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'RECIPE_REF',
                label: msg('process.ccdcSlice.panel.source.recipe.label')
            },
            {
                value: 'ASSET',
                label: msg('process.ccdcSlice.panel.source.asset.label')
            }
        ]
        return (
            <Form.Buttons
                look='transparent'
                shape='pill'
                layout='vertical'
                air='more'
                input={section}
                options={options}/>
        )
    }

    componentDidUpdate() {
        const {map} = this.props
        removeAoiLayer(map)
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
