import PropTypes from 'prop-types'
import {useContext} from 'react'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'

import {DropTargetContext} from './dropTargetContext'
import {PATH_SEPARATOR} from './recipeListConstants'

export const RecipeItem = ({
    recipe, typeName, path, highlight, hovered, edit, selected, drag$,
    onClick, onSelect, onDuplicate, onRemove
}) => {
    const drag = useContext(DropTargetContext)
    return (
        <ListItem
            hovered={drag ? false : hovered}
            drag$={drag$ || undefined}
            dragValue={{kind: 'recipe', id: recipe.id, folderId: recipe.folderId}}
            dragPointer='mouse'
            showDragHandle={false}
            onClick={() => edit ? onSelect(recipe.id) : onClick(recipe)}>
            <CrudItem
                icon='globe'
                iconSize='lg'
                title={typeName}
                description={[path, recipe.name].filter(part => part).join(PATH_SEPARATOR)}
                timestamp={recipe.updateTime}
                highlight={highlight}
                // A search matches the name and the path, never the type, so the title must not claim a hit.
                highlightTitle={false}
                duplicateTooltip={msg('process.menu.duplicateRecipe.tooltip')}
                removeTooltip={msg('process.menu.removeRecipe.tooltip')}
                selectTooltip={msg('process.menu.selectRecipe.tooltip')}
                selected={edit ? selected : undefined}
                onDuplicate={!edit && onDuplicate ? () => onDuplicate(recipe.id) : undefined}
                onRemove={!edit && onRemove ? () => onRemove(recipe.id) : undefined}
                onSelect={edit ? () => onSelect(recipe.id) : undefined}
            />
        </ListItem>
    )
}

RecipeItem.propTypes = {
    recipe: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired,
    drag$: PropTypes.object,
    edit: PropTypes.bool,
    highlight: PropTypes.any,
    hovered: PropTypes.any,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func,
    path: PropTypes.string,
    selected: PropTypes.bool,
    typeName: PropTypes.string
}
