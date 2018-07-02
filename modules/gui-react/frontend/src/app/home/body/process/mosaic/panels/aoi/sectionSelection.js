import {removeAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import Buttons from 'widget/buttons'
import PanelContent from '../panelContent'
import styles from './aoi.module.css'

export default class SectionSelection extends React.Component {
    componentWillMount() {
        const {inputs} = this.props
        Object.keys(inputs).forEach((name) => inputs[name] && inputs[name].set(''))
    }

    render() {
        const {className, inputs: {section}} = this.props
        const options = [
            {
                value: 'country',
                label: msg('process.mosaic.panel.areaOfInterest.form.country.title')
            },
            {
                value: 'fusionTable',
                label: msg('process.mosaic.panel.areaOfInterest.form.fusionTable.title')
            },
            {
                value: 'polygon',
                label: msg('process.mosaic.panel.areaOfInterest.form.polygon.title')
            }
        ]
        return (
            <PanelContent
                icon='cog'
                title={msg('process.mosaic.panel.areaOfInterest.title')}
                className={className}>
                <Buttons
                    className={styles.sources}
                    input={section}
                    options={options}/>
            </PanelContent>
        )
    }

    componentDidUpdate() {
        const {recipeId} = this.props
        removeAoiLayer(recipeId)
    }
}

SectionSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}