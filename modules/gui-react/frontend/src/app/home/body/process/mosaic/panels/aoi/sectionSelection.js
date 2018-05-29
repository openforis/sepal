import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {Button} from 'widget/button'
import PanelContent from '../panelContent'
import styles from './aoi.module.css'

export default class SectionSelection extends React.Component {
    componentWillMount() {
        const {inputs} = this.props
        Object.keys(inputs).forEach((name) => inputs[name] && inputs[name].set(''))
    }

    render() {
        const {className, inputs: {section}} = this.props
        return (
            <PanelContent
                icon='cog'
                title={msg('process.mosaic.panel.areaOfInterest.title')}
                className={className}>
                <SectionOption section={section} label={'Select country/province'} value='country'/>
                <SectionOption section={section} label={'Select from Fusion Table'} value='fusionTable'/>
                <SectionOption section={section} label={'Draw polygon'} value='polygon'/>
            </PanelContent>
        )
    }
}

const SectionOption = ({label, value, section}) =>
    <Button onClick={() => section.set(value)} className={styles.sectionOption}>
        {label}
    </Button>

SectionSelection.propTypes = {
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}