import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'

const ToImage = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.classChange.panel.inputImage.to.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export default compose(
    ToImage,
    recipeFormPanel({id: 'toImage', fields, modelToValues, valuesToModel})
)
