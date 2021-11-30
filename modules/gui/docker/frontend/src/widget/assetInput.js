import {Form} from './form/form'
import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'
import guid from 'guid'

class _AssetInput extends React.Component {
    assetChanged$ = new Subject()

    render() {
        const {className, input, label, placeholder, autoFocus} = this.props
        return (
            <Form.Input
                className={className}
                label={label}
                placeholder={placeholder}
                input={input}
                autoFocus={autoFocus}
                spellCheck={false}
                onChangeDebounced={asset => asset.length && this.loadMetadata(asset)}
                busyMessage={this.props.stream('LOAD_ASSET_METADATA').active && msg('widget.loading')}
                errorMessage
            />
        )
    }

    loadMetadata(asset) {
        const {expectedType, input, onError, onLoading, onLoaded, stream} = this.props
        onLoading && onLoading(asset)
        this.assetChanged$.next()
        stream('LOAD_ASSET_METADATA',
            (expectedType === 'Image'
                ? api.gee.imageMetadata$({asset})
                : api.gee.assetMetadata$({asset, expectedType})
            ).pipe(
                takeUntil(this.assetChanged$)
            ),
            metadata => onLoaded && onLoaded({
                asset,
                metadata,
                visualizations: metadata.bands
                    ? toVisualizations(metadata.properties, metadata.bands)
                        .map(visualization => ({...visualization, id: guid()}))
                    : undefined
            }),
            error => {
                onError && onError(error)
                input.setInvalid(
                    error.response && error.response.messageKey
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('widget.assetInput.loadError')
                )
            }
        )
    }
}

export const AssetInput = compose(
    _AssetInput,
    connect()
)

AssetInput.defaultProps = {
    expectedType: 'Image'
}

AssetInput.propTypes = {
    input: PropTypes.object.isRequired,
    className: PropTypes.any,
    expectedType: PropTypes.string,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func,
}
