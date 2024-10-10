import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'

const fields = {
    allOutputNames: new Form.Field(),
    outputName: new Form.Field()
        .notBlank()
        .match(/^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/, 'process.bandMath.panel.outputBands.invalidFormat'),
}

const constraints = {
    unique: new Form.Constraint(['outputName', 'allOutputNames'])
        .predicate(
            ({outputName, allOutputNames}) => isUnique(outputName, allOutputNames),
            'process.bandMath.panel.outputBands.duplicateBand'
        )
}

class _BandName extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {originalName, inputs: {outputName}} = this.props
        return (
            <Form.Input
                label={originalName}
                input={outputName}
                placeholder={`${originalName}...`}
                errorMessage={[outputName, 'unique']}
                autoComplete={false}
                onChange={this.onChange}
            />
        )
    }

    componentDidMount() {
        const {inputs: {outputName}} = this.props
        outputName.set(this.props.outputName)
        this.update()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {outputName: {validationFailed: prevFailed}}} = prevProps
        const {componentId, inputs: {outputName: {validationFailed: failed}}, onValidationStatusChanged} = this.props
        if (prevFailed !== failed) {
            onValidationStatusChanged(componentId, !failed)
        }
        this.update()
    }

    update() {
        const {inputs: {allOutputNames}} = this.props
        allOutputNames.set(this.props.allOutputNames)
    }
    
    onChange(outputName) {
        const {onChange} = this.props
        onChange(outputName)
    }
}

export const BandName = compose(
    _BandName,
    withForm({fields, constraints})
)

const isUnique = (outputName, allOutputNames) => !allOutputNames || allOutputNames.filter(name => name === outputName).length <= 1

BandName.propTypes = {
    image: PropTypes.object.isRequired,
    images: PropTypes.array.isRequired,
    originalName: PropTypes.string.isRequired,
    outputName: PropTypes.string.isRequired,
    onChange: PropTypes.func,
    onValidationStatusChanged: PropTypes.func
}
