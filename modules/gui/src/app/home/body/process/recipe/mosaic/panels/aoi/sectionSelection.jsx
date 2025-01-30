import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

export class SectionSelection extends React.Component {
    render() {
        const {assetBounds, inputs: {section}} = this.props
        const options = [
            assetBounds ? {
                value: 'ASSET_BOUNDS',
                label: msg('process.mosaic.panel.areaOfInterest.form.assetBounds.title')
            } : null,
            {
                value: 'COUNTRY',
                label: msg('process.mosaic.panel.areaOfInterest.form.country.title')
            },
            {
                value: 'EE_TABLE',
                label: msg('process.mosaic.panel.areaOfInterest.form.eeTable.title')
            },
            {
                value: 'ASSET',
                label: msg('process.mosaic.panel.areaOfInterest.form.asset.title')
            },
            {
                value: 'RECIPE',
                label: msg('process.mosaic.panel.areaOfInterest.form.recipe.title')
            },
            {
                value: 'POLYGON',
                label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title')
            },
        ].filter(option => option)
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

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    assetBounds: PropTypes.any
}
