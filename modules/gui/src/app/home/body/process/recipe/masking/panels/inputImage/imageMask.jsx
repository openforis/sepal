import {recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {fields, InputImage, modelToValues, valuesToModel} from './inputImage'
import {maskImage} from './recipeSection'

const _ImageMask = ({form, inputs, recipeActionBuilder, fromBand}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.masking.panel.inputImage.imageMask.title')}
        filter={maskImage}
        recipeActionBuilder={recipeActionBuilder}
        fromBand={fromBand}
    />

export const ImageMask = compose(
    _ImageMask,
    recipeFormPanel({id: 'imageMask', fields, modelToValues, valuesToModel})
)
