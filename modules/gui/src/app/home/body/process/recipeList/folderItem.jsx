import PropTypes from 'prop-types'
import {useContext} from 'react'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'

import {DropTargetContext} from './dropTargetContext'
import styles from './folderItem.module.css'

// Direct children only, so what the row claims and what removal allows never disagree.
const description = ({folders, recipes}) =>
    [
        folders ? msg('process.folder.folderCount', {count: folders}) : null,
        msg('process.folder.description', {count: recipes})
    ].filter(part => part).join(' · ')

export const FolderItem = ({folder, counts, highlight, hovered, drag$, onClick, onEdit, onRemove}) => {
    const dropTarget = useContext(DropTargetContext)
    return (
        <div
            data-drop-folder-id={folder.id}
            className={dropTarget?.folderId === folder.id ? styles.dropTarget : null}>
            <ListItem
                hovered={hovered}
                drag$={drag$ || undefined}
                dragValue={{kind: 'folder', id: folder.id, folderId: folder.parentId, folder}}
                dragTarget='handle'
                onClick={() => onClick(folder)}>
                <CrudItem
                    icon='folder-open'
                    iconClassName={styles.icon}
                    iconSize='lg'
                    title={folder.name}
                    description={description(counts)}
                    highlight={highlight}
                    editTooltip={msg('process.folder.edit.tooltip')}
                    removeTooltip={msg('process.folder.remove.tooltip')}
                    removeTitle={msg('process.folder.remove.title')}
                    removeMessage={msg('process.folder.remove.confirm')}
                    onEdit={onEdit ? () => onEdit(folder) : undefined}
                    onRemove={onRemove ? () => onRemove(folder) : undefined}
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
    highlight: PropTypes.any,
    hovered: PropTypes.any,
    onEdit: PropTypes.func,
    onRemove: PropTypes.func
}
