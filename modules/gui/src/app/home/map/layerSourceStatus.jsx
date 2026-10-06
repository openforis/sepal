import React from 'react'

import {withContext} from '~/context'
import {msg} from '~/translate'
import {Button} from '~/widget/button'

// What a layer tells its form about the sources it draws from: {checking, unavailable, failing} (sourceStatus.js), the
// requirement holding what it shows, if any: `heldSource` {state, recipe, section} (selectedSourceStatus.js), and its explicit
// refresh: {refresh, refreshing}. Provided by the layer that owns the answer and read by the form the layer
// type renders, so no type's form has to pass it along.

const Context = React.createContext(null)

export const LayerSourceStatus = ({status, children}) =>
    <Context.Provider value={status}>
        {children}
    </Context.Provider>

export const withLayerSourceStatus = withContext(Context, 'layerSourceStatus')

// Reads the layer's sources again and draws it again, even when nothing reported a change.
export const RefreshSourcesButton = ({refreshing, onRefresh}) =>
    <Button
        chromeless
        shape='circle'
        size='small'
        icon='rotate'
        iconAttributes={{spin: refreshing}}
        tooltip={msg('map.layerSource.refresh.tooltip')}
        disabled={refreshing}
        onClick={onRefresh}
    />
