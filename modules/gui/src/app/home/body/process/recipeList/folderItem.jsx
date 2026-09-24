import PropTypes from 'prop-types'
import {useContext} from 'react'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'

import {DropTargetContext} from './dropTargetContext'

// Direct children only, so what the row claims and what removal allows never disagree.
export const folderDescription = ({folders, recipes}) =>
    [
        folders ? msg('process.folder.folderCount', {count: folders}) : null,
        msg('process.folder.description', {count: recipes})
    ].filter(part => part).join(' · ')

export const FolderItem = ({folder, counts, highlight, hovered, edit, selected, drag$, onClick, onSelect, onEdit, onRemove}) => {
    const drag = useContext(DropTargetContext)
    return (
        <div data-drop-folder-id={folder.id}>
            <ListItem
                hovered={drag ? drag.target?.folderId === folder.id : hovered}
                drag$={drag$ || undefined}
                dragValue={{kind: 'folder', id: folder.id, folderId: folder.parentId, folder}}
                dragPointer='mouse'
                showDragHandle={false}
                onClick={() => edit ? onSelect(folder.id) : onClick(folder)}>
                <CrudItem
                    icon='folder-open'
                    iconSize='lg'
                    iconVariant='info'
                    title={folder.name}
                    description={folderDescription(counts)}
                    highlight={highlight}
                    editTooltip={msg('process.folder.edit.tooltip')}
                    removeTooltip={msg('process.folder.remove.tooltip')}
                    removeTitle={msg('process.folder.remove.title')}
                    removeMessage={msg('process.folder.remove.confirm')}
                    selectTooltip={msg('process.menu.selectRecipe.tooltip')}
                    selected={edit ? selected : undefined}
                    onEdit={!edit && onEdit ? () => onEdit(folder) : undefined}
                    onRemove={!edit && onRemove ? () => onRemove(folder) : undefined}
                    onSelect={edit ? () => onSelect(folder.id) : undefined}
                />
            </ListItem>
        </div>
    )
}

FolderItem.propTypes = {
    counts: PropTypes.object.isRequired,
    folder: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired,
    drag$: PropTypes.object,
    edit: PropTypes.bool,
    highlight: PropTypes.any,
    hovered: PropTypes.any,
    selected: PropTypes.bool,
    onEdit: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func
}
