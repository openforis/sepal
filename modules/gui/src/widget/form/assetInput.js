import PropTypes from 'prop-types'
import React from 'react'
import {catchError, debounceTime, EMPTY, map, Subject, switchMap, tap} from 'rxjs'

import api from '~/apiRegistry'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {uuid} from '~/uuid'

import {FormInput} from './input'

const DEBOUNCE_TIME_MS = 750

class _FormAssetInput extends React.Component {
    asset$ = new Subject()
    
    state = {
        loading: null
    }

    render() {
        const {className, input, label, labelButtons, buttons, placeholder, tooltip, autoFocus, busyMessage, disabled} = this.props
        const {loading} = this.state
        return (
            <FormInput
                className={className}
                label={label}
                labelButtons={labelButtons}
                buttons={buttons}
                placeholder={placeholder}
                tooltip={tooltip}
                input={input}
                autoFocus={autoFocus}
                spellCheck={false}
                busyMessage={(busyMessage || loading) && msg('widget.loading')}
                disabled={disabled}
            />
        )
    }

    componentDidMount() {
        const {input} = this.props
        this.loadAssetMetadata()
        if (input.value) {
            this.asset$.next(input.value)
        }
    }
    
    componentDidUpdate(prevProps) {
        const {input: prevInput} = prevProps
        const {input} = this.props
        if (input?.value !== prevInput?.value) {
            this.asset$.next(input.value)
        }
    }

    loadAssetMetadata() {
        const {addSubscription, onLoading} = this.props
        addSubscription(
            this.asset$.pipe(
                debounceTime(DEBOUNCE_TIME_MS),
                tap(asset => {
                    this.setState({loading: asset})
                    onLoading && onLoading(asset)
                }),
                switchMap(asset =>
                    this.getMetadata$(asset).pipe(
                        tap(() => {
                            this.setState({loading: null})
                        }),
                        catchError(error => {
                            this.setState({loading: null})
                            this.onError(error)
                            return EMPTY
                        }),
                        map(metadata => ({asset, metadata}))
                    )
                )
            ).subscribe(
                ({asset, metadata}) => this.onMetadata({asset, metadata})
            )
        )
    }

    getMetadata$(asset) {
        const {expectedType} = this.props
        return expectedType === 'Image'
            ? api.gee.imageMetadata$({asset})
            : api.gee.assetMetadata$({asset, allowedTypes: expectedType})
    }

    onMetadata({asset, metadata}) {
        const {onLoaded} = this.props
        return onLoaded && onLoaded(metadata ? {
            asset,
            metadata,
            visualizations: metadata.bands
                ? toVisualizations(metadata.properties, metadata.bands)
                    .map(visualization => ({...visualization, id: uuid()}))
                : undefined
        } : null)
    }

    onError(error) {
        const {input, onError} = this.props
        if (onError) {
            onError(error)
        } else {
            input.setInvalid(
                error.response && error.response.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : msg('widget.assetInput.loadError')
            )
        }
    }
}

export const FormAssetInput = compose(
    _FormAssetInput,
    withSubscriptions(),
    connect()
)

FormAssetInput.propTypes = {
    input: PropTypes.object.isRequired,
    autoFocus: PropTypes.any,
    busyMessage: PropTypes.any,
    buttons: PropTypes.any,
    className: PropTypes.any,
    disabled: PropTypes.any,
    expectedType: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func,
}
