import {Form} from 'widget/form/form'
import {compose} from 'compose'
import {msg} from 'translate'
import {removeAoiLayer} from 'app/home/map/aoiLayer'
import {withMapContext} from 'app/home/map/mapContext'
import PropTypes from 'prop-types'
import React from 'react'

class _SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'COUNTRY',
                label: msg('process.mosaic.panel.areaOfInterest.form.country.title')
            },
            {
                value: 'EE_TABLE',
                label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.title')
            },
            {
                value: 'POLYGON',
                label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title')
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
        const {mapContext: {sepalMap}} = this.props
        removeAoiLayer(sepalMap)
    }
}

export const SectionSelection = compose(
    _SectionSelection,
    withMapContext()
)

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}
