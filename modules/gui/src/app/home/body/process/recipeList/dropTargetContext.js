import React from 'react'

// null while nothing is dragged over a valid target, otherwise {folderId}. An object rather than a bare
// id, because the root's id is null and must stay distinguishable from "no target at all".
export const DropTargetContext = React.createContext(null)
