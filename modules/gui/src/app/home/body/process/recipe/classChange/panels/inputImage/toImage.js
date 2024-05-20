import {recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {fields, InputImage, modelToValues, valuesToModel} from './inputImage'

const _ToImage = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.classChange.panel.inputImage.to.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export const ToImage = compose(
    _ToImage,
    recipeFormPanel({id: 'toImage', fields, modelToValues, valuesToModel})
)
