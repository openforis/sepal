import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../body/process/recipeContext'
import React from 'react'
import styles from './progress.module.css'

const mapRecipeToProps = recipe => ({
    working: !!Object.keys(selectFrom(recipe, 'ui.mapOperations') || {}).length
})

const _Progress = ({working}) =>
    <div className={[styles.progress, working ? styles.active : null].join(' ')}/>

export const Progress = compose(
    _Progress,
    withRecipe(mapRecipeToProps)
)

export const setActive = (id, recipeActionBuilder) =>
    recipeActionBuilder('SET_MAP_OPERATION', id)
        .set(['ui.mapOperations', id], true)
        .dispatch()

export const setComplete = (id, recipeActionBuilder) =>
    recipeActionBuilder('COMPLETE_MAP_OPERATION', id)
        .del(['ui.mapOperations', id])
        .dispatch()

Progress.propTypes = {}
