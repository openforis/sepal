import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'

const _ImageToMask = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.masking.panel.inputImage.imageToMask.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export const ImageToMask = compose(
    _ImageToMask,
    recipeFormPanel({id: 'imageToMask', fields, modelToValues, valuesToModel})
)
