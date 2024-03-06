import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'

const _ImageMask = ({form, inputs, recipeActionBuilder, fromBand}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.masking.panel.inputImage.imageMask.title')}
        recipeActionBuilder={recipeActionBuilder}
        fromBand={fromBand}
    />

export const ImageMask = compose(
    _ImageMask,
    recipeFormPanel({id: 'imageMask', fields, modelToValues, valuesToModel})
)
