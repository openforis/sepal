import {recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {fields, InputImage, modelToValues, valuesToModel} from './inputImage'

const mapRecipeToProps = recipe => ({
    fromBand: selectFrom(recipe, 'model.fromImage.band')
})
const _ToImage = ({form, inputs, recipeActionBuilder, fromBand}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.indexChange.panel.inputImage.to.title')}
        recipeActionBuilder={recipeActionBuilder}
        fromBand={fromBand}
    />

export const ToImage = compose(
    _ToImage,
    recipeFormPanel({id: 'toImage', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
