import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {RemoveButton} from '~/widget/removeButton'

import styles from './outputBands.module.css'
import {isUniqueOutputName, isValidOutputName, outputNameOf} from './outputImages'

const fields = {
    allOutputBandNames: new Form.Field(),
    defaultOutputName: new Form.Field(),
    // The name the band was given automatically is shown as it is, unchecked; one typed is checked.
    outputName: new Form.Field()
        .predicate(
            (outputName, {defaultOutputName}) => outputName === defaultOutputName || isValidOutputName(outputName),
            'process.bandMath.panel.outputBands.invalidFormat'
        )
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
                tooltip={outputName.value ? msg('process.bandMath.panel.outputBands.resetName.tooltip') : null}
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
        const {inputs: {outputName}} = this.props
        outputName.setInitialValue(shownName(this.props))
        this.setOutputNames()
    }

    componentDidUpdate(prevProps) {
        this.followShownName(prevProps)
        this.setOutputNames()
    }

    // A field showing the name the band was given follows it as it is given another, or allocated one: one cleared or
    // typed in is the user's.
    followShownName(prevProps) {
        const {band, inputs: {outputName}} = this.props
        const shown = shownName(this.props)
        if (!band.outputName && shown !== shownName(prevProps) && outputName.value === shownName(prevProps)) {
            outputName.setInitialValue(shown)
        }
    }

    // The names the row's feedback is checked against, as the panel holds them: another band's custom name can change
    // this band's default.
    setOutputNames() {
        const {band, inputs: {allOutputBandNames, defaultOutputName}} = this.props
        defaultOutputName.set(band.defaultOutputName)
        allOutputBandNames.set(this.props.allOutputBandNames)
    }

    // A name typed is the band's own, unless it is the name the band was given; a field cleared resets the band, which
    // adopts the name now available to it (outputBands.jsx).
    change(text) {
        const {band, image, onChange} = this.props
        const outputName = text && text !== band.defaultOutputName ? text : undefined
        onChange({image, band: {...band, outputName}, reset: !text})
    }

    remove() {
        const {band, image, onRemove} = this.props
        onRemove({image, band})
    }
}

// The field shows the name the band is output under where it is saved, typed or given automatically; a default
// allocated while the panel is open is a suggestion, shown as the placeholder of an empty field.
const shownName = ({band, allocated}) =>
    band.outputName || (allocated ? '' : band.defaultOutputName)

export const OutputBand = compose(
    _OutputBand,
    withForm({fields, constraints})
)

OutputBand.propTypes = {
    allOutputBandNames: PropTypes.array.isRequired,
    allocated: PropTypes.bool,
    band: PropTypes.object.isRequired,
    image: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
}
