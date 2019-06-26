import {Form} from 'widget/form/form'
import {msg} from 'translate'
import {removeAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './aoi.module.css'

export default class SectionSelection extends React.Component {
    render() {
        const {inputs: {section}} = this.props
        const options = [
            {
                value: 'COUNTRY',
                label: msg('process.mosaic.panel.areaOfInterest.form.country.title')
            },
            {
                value: 'FUSION_TABLE',
                label: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title')
            },
            {
                value: 'POLYGON',
                label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title')
            }
        ]
        return (
            <Form.Buttons
                type='vertical'
                className={styles.sources}
                input={section}
                options={options}/>
        )
    }

    componentDidUpdate() {
        const {recipeId} = this.props
        removeAoiLayer(recipeId)
    }
}

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}
