import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {RemoveButton} from '~/widget/removeButton'

import styles from './outputBands.module.css'

const fields = {
    allOutputBandNames: new Form.Field(),
    outputName: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.outputBands.invalidFormat')
}

const constraints = {
    unique: new Form.Constraint(['outputName', 'allOutputBandNames'])
        .predicate(
            ({outputName, allOutputBandNames}) => isUnique(outputName, allOutputBandNames),
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
                placeholder={`${band.name}...`}
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
        this.setOtherOutputNames()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {outputName: {validationFailed: prevFailed}}} = prevProps
        const {componentId, inputs: {outputName: {validationFailed: failed}}, onValidationStatusChanged} = this.props
        if (prevFailed !== failed) {
            onValidationStatusChanged(componentId, !failed)
        }

        this.setOtherOutputNames()
    }

    setOtherOutputNames() {
        const {inputs: {allOutputBandNames}} = this.props
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

const isUnique = (outputName, allOutputBandNames) =>
    !allOutputBandNames || allOutputBandNames.filter(name => name === outputName).length <= 1

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
    onValidationStatusChanged: PropTypes.func.isRequired,
}
