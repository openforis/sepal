import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {RemoveButton} from '~/widget/removeButton'

import styles from './outputBands.module.css'
import {isUniqueOutputName, isValidOutputName, outputNameOf} from './outputImages'

const fields = {
    allOutputBandNames: new Form.Field(),
    defaultOutputName: new Form.Field(),
    outputName: new Form.Field()
        .predicate(isValidOutputName, 'process.bandMath.panel.outputBands.invalidFormat')
}

const constraints = {
    unique: new Form.Constraint(['defaultOutputName', 'outputName', 'allOutputBandNames'])
        .predicate(
            ({defaultOutputName, outputName, allOutputBandNames}) =>
                isUniqueOutputName(outputNameOf({outputName, defaultOutputName}), allOutputBandNames || []),
            'process.bandMath.panel.outputBands.duplicateBand'
        )
}

class _OutputBand extends React.Component {
    constructor(props) {
        super(props)
        this.change = this.change.bind(this)
        this.remove = this.remove.bind(this)
    }

    render() {
        const {band, inputs: {outputName}} = this.props
        return (
            <Form.Input
                className={styles.outputName}
                label={band.name}
                input={outputName}
                placeholder={band.defaultOutputName}
                errorMessage={[outputName, 'unique']}
                autoComplete={false}
                labelButtons={[this.renderRemoveButton()]}
                onChange={this.change}
            />
        )
    }

    renderRemoveButton() {
        return (
            <RemoveButton
                key='remove'
                chromeless
                shape='circle'
                size='small'
                unsafe
                onRemove={this.remove}
            />
        )
    }
    
    componentDidMount() {
        const {band, inputs: {outputName}} = this.props
        outputName.set(band.outputName)
        this.setOutputNames()
    }

    componentDidUpdate() {
        this.setOutputNames()
    }

    // The names the row's feedback is checked against, as the panel holds them: another band's custom name can change
    // this band's default.
    setOutputNames() {
        const {band, inputs: {allOutputBandNames, defaultOutputName}} = this.props
        defaultOutputName.set(band.defaultOutputName)
        allOutputBandNames.set(this.props.allOutputBandNames)
    }

    change(outputName) {
        const {band, image, onChange} = this.props
        onChange({image, band: {...band, outputName}})
    }

    remove() {
        const {band, image, onRemove} = this.props
        onRemove({image, band})
    }
}

export const OutputBand = compose(
    _OutputBand,
    withForm({fields, constraints})
)

OutputBand.propTypes = {
    allOutputBandNames: PropTypes.array.isRequired,
    band: PropTypes.object.isRequired,
    image: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
}
