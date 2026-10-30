import PropTypes from 'prop-types'
import React, {useMemo} from 'react'

import {composeHoC} from '~/compose'
import {withContext} from '~/context'
import {withEnabled} from '~/enabled'
import {withTabDialogs} from '~/widget/tabs/tabContext'

const Context = React.createContext()

// Who a modal panel belongs to, for everything rendered within: 'recipe' keeps it to the tab of its recipe - shown,
// covering and dismissed there alone (panel.jsx) - and 'application' over everything. Nested dialogs inherit it; a
// panel overrides it only with its own `scope`.
export const ModalScope = ({scope, dialogId, children}) => {
    const value = useMemo(() => ({scope, dialogId}), [scope, dialogId])
    return <Context.Provider value={value}>{children}</Context.Provider>
}

export const withModalScope = withContext(Context, 'modalScope')

// Native inertness does not reach a document shortcut or a popup in the global portal. Both follow the same
// owner: navigation stays enabled outside the tab, and within it only the top dialog can interact.
export const withModalInteraction = () => composeHoC(
    Component => function WithModalInteraction(props) {
        const {enabled, modalScope, tabDialogs} = props
        const open = tabDialogs?.open
        const interactive = modalScope?.scope === 'application' || !open?.length || open.at(-1) === modalScope?.dialogId
        return <Component {...props} interactionEnabled={enabled !== false && interactive}/>
    },
    withEnabled(),
    withModalScope(),
    withTabDialogs()
)

ModalScope.propTypes = {
    children: PropTypes.any,
    dialogId: PropTypes.string,
    scope: PropTypes.oneOf(['recipe', 'application'])
}
