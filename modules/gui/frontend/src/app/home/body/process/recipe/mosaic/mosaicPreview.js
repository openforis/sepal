import {recipeActionBuilder} from '../../recipe'

export const MosaicPreview = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        hide() {
            actionBuilder('HIDE_PREVIEW')
                .set('ui.hidePreview', true)
                .dispatch()
        },
        show() {
            actionBuilder('HIDE_PREVIEW')
                .set('ui.hidePreview', false)
                .dispatch()
        }
    }
}
