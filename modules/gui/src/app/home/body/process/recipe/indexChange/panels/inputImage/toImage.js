import {InputImage, fields, modelToValues, valuesToModel} from './inputImage'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {selectFrom} from 'stateUtils'
import React from 'react'

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
