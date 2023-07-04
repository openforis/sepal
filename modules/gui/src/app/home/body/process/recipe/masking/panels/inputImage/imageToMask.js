import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'

const ImageToMask = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.masking.panel.inputImage.imageToMask.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export default compose(
    ImageToMask,
    recipeFormPanel({id: 'imageToMask', fields, modelToValues, valuesToModel})
)
