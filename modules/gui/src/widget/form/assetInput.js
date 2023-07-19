import {Form} from './form'
import {Subject, takeUntil, tap} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'
import guid from 'guid'

class _FormAssetInput extends React.Component {
    assetChanged$ = new Subject()
    state = {
        loading: null
    }

    render() {
        const {className, input, label, placeholder, tooltip, autoFocus, busyMessage, disabled} = this.props
        return (
            <Form.Input
                className={className}
                label={label}
                placeholder={placeholder}
                tooltip={tooltip}
                input={input}
                autoFocus={autoFocus}
                spellCheck={false}
                onChangeDebounced={asset => {
                    return asset.length && this.loadMetadata(asset)
                }}
                busyMessage={(busyMessage || this.props.stream('LOAD_ASSET_METADATA').active) && msg('widget.loading')}
                disabled={disabled}
                errorMessage
            />
        )
    }

    componentDidMount() {
        const {input} = this.props
        if (input.value) {
            this.loadMetadata(input.value)
        }

    }
    
    componentDidUpdate(prevProps) {
        const {input: prevInput} = prevProps
        const {input} = this.props
        if (!prevInput?.value && input.value) {
            this.loadMetadata(input.value)
        }
    }

    loadMetadata(asset) {
        const {expectedType, onError, onLoading, onLoaded, stream} = this.props
        const {loading} = this.state
        if (loading === asset) {
            return
        }
        this.setState({loading: asset})
        onLoading && onLoading(asset)
        this.assetChanged$.next()
        stream('LOAD_ASSET_METADATA',
            (expectedType === 'Image'
                ? api.gee.imageMetadata$({asset})
                : api.gee.assetMetadata$({asset, expectedType})
            ).pipe(
                takeUntil(this.assetChanged$.pipe()),
                tap(() => this.setState({loading: null}))
            ),
            metadata => {
                return onLoaded && onLoaded(metadata ? {
                    asset,
                    metadata,
                    visualizations: metadata.bands
                        ? toVisualizations(metadata.properties, metadata.bands)
                            .map(visualization => ({...visualization, id: guid()}))
                        : undefined
                } : null)
            },
            onError
        )
    }
}

export const FormAssetInput = compose(
    _FormAssetInput,
    connect()
)

FormAssetInput.propTypes = {
    input: PropTypes.object.isRequired,
    autoFocus: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.any,
    disabled: PropTypes.any,
    expectedType: PropTypes.any,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func,
}
