import {recipeActionBuilder, recipePath} from '../../recipe'
import {select} from 'store'

export const MosaicPreview = id => {
    const actionBuilder = recipeActionBuilder(id)
    const tabPath = recipePath(id)

    return {
        hide() {
            if (select(tabPath)) {
                actionBuilder('HIDE_PREVIEW')
                    .set('ui.hidePreview', true)
                    .dispatch()
            }
        },
        show() {
            if (select(tabPath)) {
                actionBuilder('SHOW_PREVIEW')
                    .set('ui.hidePreview', false)
                    .dispatch()
            }
        }
    }
}
