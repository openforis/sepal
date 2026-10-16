import PropTypes from 'prop-types'
import {useSelector} from 'react-redux'

import {select} from '~/store'
import {msg} from '~/translate'
import {CopyButton} from '~/widget/copyButton'

import {locationLabel, locationPath} from './recipeList/recipeTree'
import styles from './recipeLocation.module.css'

// Read from the store rather than handed in, so a move made anywhere shows here at once.
const useRecipePath = (recipeId, name, format = locationLabel) =>
    useSelector(() => format(
        select('process.folders'),
        select(['process.loadedRecipes', recipeId, 'folderId']),
        name
    ))

export const RecipeTabTooltip = ({recipeId, name}) => {
    const path = useRecipePath(recipeId, name)
    const copiedPath = useRecipePath(recipeId, name, locationPath)
    return (
        <span className={styles.tooltip}>
            <span className={styles.tooltipPath}>{path}</span>
            <CopyButton
                value={copiedPath}
                chromeless
                shape='circle'
                size='small'
                air='less'
                icon='copy'
                tooltip={msg('button.copyToClipboard')}
            />
        </span>
    )
}

RecipeTabTooltip.propTypes = {
    recipeId: PropTypes.string.isRequired,
    name: PropTypes.string
}
