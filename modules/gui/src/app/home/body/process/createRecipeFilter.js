import _ from 'lodash'

import {simplifyString} from '~/string'

// Sentinel for the "All" chip: a tag filter that matches every recipe type.
export const IGNORE = 'IGNORE'

const SEARCH_PROPERTIES = ['labels.name', 'labels.creationDescription']

export const recipeTypeTags = recipeTypes =>
    _.chain(recipeTypes)
        .map(({tags}) => tags)
        .flatten()
        .uniq()
        .compact()
        .value()

// Picking the selected chip again clears the filter, matching the apps tag filter.
export const nextTagFilter = (tagFilter, prevTagFilter) =>
    tagFilter !== prevTagFilter ? tagFilter : IGNORE

// The panel's cleared state, reapplied every time it closes.
export const noFilters = () => ({
    textFilterValues: [],
    tagFilter: IGNORE
})

const matchesTagFilter = (recipeType, tagFilter) =>
    tagFilter === IGNORE || !!recipeType.tags?.includes(tagFilter)

const matchesSearchMatchers = (recipeType, searchMatchers) =>
    _.every(searchMatchers, matcher =>
        _.find(SEARCH_PROPERTIES, property =>
            matcher.test(simplifyString(_.get(recipeType, property)))
        )
    )

export const filterRecipeTypes = ({recipeTypes, textFilterValues = [], tagFilter}) => {
    const searchMatchers = textFilterValues.map(filter => RegExp(filter, 'i'))
    return recipeTypes.filter(recipeType =>
        matchesSearchMatchers(recipeType, searchMatchers) && matchesTagFilter(recipeType, tagFilter)
    )
}
