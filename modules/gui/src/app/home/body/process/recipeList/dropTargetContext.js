import React from 'react'

// null while nothing is being dragged. During a drag it holds {target}, where target is {folderId} for
// the folder the pointer can drop into, or null when the pointer is over nothing that takes a drop. An
// object rather than a bare id, because the root's id is null and must stay distinguishable from "no
// target at all".
//
// Rows and breadcrumb segments read it to decide their hover: the pointer gives the hover look to
// whatever it passes over, so while a drag is in progress only what takes the drop may wear it.
export const DropTargetContext = React.createContext(null)
