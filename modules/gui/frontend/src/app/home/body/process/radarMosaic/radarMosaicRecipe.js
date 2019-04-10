import {recipeActionBuilder} from 'app/home/body/process/recipe'
import moment from 'moment'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        corrections: ['GAMMA0'],
        mask: ['OUTLIERS', 'LAYOVER'],
        speckleFilter: 'NONE',
        orbits: ['ASCENDING']
    }
}


export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
        hidePreview() {
            return set('HIDE_PREVIEW', 'ui.hidePreview', true)
        },
        showPreview() {
            return set('SHOW_PREVIEW', 'ui.hidePreview', false)
        }
    }
}
