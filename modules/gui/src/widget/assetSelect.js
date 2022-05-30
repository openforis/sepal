import {AssetInput} from './assetInput'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export class AssetSelect extends React.Component {
    constructor(props) {
        super(props)
        this.onError = this.onError.bind(this)
    }

    render() {
        const {className, input, label, placeholder, autoFocus, expectedType, disabled, onLoading, onLoaded, onError} = this.props
        return (
            <AssetInput
                className={className}
                input={input}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                disabled={disabled}
                expectedType={expectedType}
                onLoading={onLoading}
                onLoaded={onLoaded}
                onError={this.onError}
            />
        )
    }

    onError(error) {
        const {input, onError} = this.props
        onError && onError(error)
        input.setInvalid(
            error.response && error.response.messageKey
                ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                : msg('widget.assetInput.loadError')
        )
    }
}

AssetSelect.defaultProps = {
    expectedType: ['Image', 'ImageCollection']
}

AssetSelect.propTypes = {
    input: PropTypes.object.isRequired,
    autoFocus: PropTypes.any,
    className: PropTypes.any,
    disabled: PropTypes.any,
    expectedType: PropTypes.any,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func
}
