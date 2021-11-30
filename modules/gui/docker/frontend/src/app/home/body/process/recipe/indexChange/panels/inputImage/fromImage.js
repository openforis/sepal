import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'

const FromImage = ({form, inputs, recipeActionBuilder}) =>
    <InputImage
        form={form}
        inputs={inputs}
        title={msg('process.indexChange.panel.inputImage.from.title')}
        recipeActionBuilder={recipeActionBuilder}
    />

export default compose(
    FromImage,
    recipeFormPanel({id: 'fromImage', fields, modelToValues, valuesToModel})
)
