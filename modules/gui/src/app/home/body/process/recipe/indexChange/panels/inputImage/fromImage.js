import {recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {fields, InputImage, modelToValues, valuesToModel} from './inputImage'

const _FromImage = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.indexChange.panel.inputImage.from.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export const FromImage = compose(
    _FromImage,
    recipeFormPanel({id: 'fromImage', fields, modelToValues, valuesToModel})
)
