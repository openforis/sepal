import {msg} from 'translate'

export const PROJECT_RECIPE_SEPARATOR = ' / '

export const NO_PROJECT_SYMBOL = '<no project>'

export const NO_PROJECT_OPTION = () => ({
    value: NO_PROJECT_SYMBOL,
    label: msg('process.project.noProjectOption')
})
