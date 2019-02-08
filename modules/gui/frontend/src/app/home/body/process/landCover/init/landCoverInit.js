import {withRecipe} from 'app/home/body/process/recipeContext'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import W from 'widget/workflow'
import InitToolbar from './initToolbar'


const recipeToProps = recipe => {
    const model = recipe.model
    return {
        nextDisabled: !model.aoi || !model.period || !model.typology
    }
}

class LandCoverInit extends React.Component {
    render() {
        const {nextDisabled, recipeContext: {recipeId, statePath}} = this.props
        return (
            <W.Step>
                <W.Content>
                    <MapToolbar
                        statePath={statePath + '.ui'}
                        mapContext={recipeId}
                        labelLayerIndex={1}/>

                    <InitToolbar recipeId={recipeId}/>
                </W.Content>
                <W.Bar>
                    <W.Center>
                        Specify Area of interest, time period, and typology.
                    </W.Center>
                    <W.Right>
                        <W.NextButton
                            label='Composites'
                            step='composites'
                            disabled={nextDisabled}
                        />
                    </W.Right>
                </W.Bar>
            </W.Step>
        )
    }
}

export default withRecipe(recipeToProps)(
    LandCoverInit
)


// import {withRecipePath} from 'app/home/body/process/recipe'
// import MapToolbar from 'app/home/map/mapToolbar'
// import React from 'react'
// import {connect, select} from 'store'
// import W from 'widget/workflow'
// import {RecipeState} from '../landCoverRecipe'
// import InitToolbar from './initToolbar'
//
// const mapStateToProps = (state, ownProps) => {
//     const recipeState = RecipeState(ownProps.recipeId)
//     return {
//         status: recipeState('model.status'),
//         aoi: recipeState('model.aoi'),
//         tabCount: select('process.tabs').length,
//         initialized: recipeState('ui.initialized')
//     }
// }
//
// class LandCoverInit extends React.Component {
//     render() {
//         const {recipeId, recipePath, initialized} = this.props
//         return (
//             <W.Step>
//                 <W.Content>
//                     <MapToolbar
//                         statePath={recipePath + '.ui'}
//                         mapContext={recipeId}
//                         labelLayerIndex={1}/>
//
//                     <InitToolbar recipeId={recipeId}/>
//                 </W.Content>
//                 <W.Bar>
//                     <W.Center>
//                         Specify Area of interest, time period, and typology.
//                     </W.Center>
//                     <W.Right>
//                         <W.NextButton label='Composites' step='composites' disabled={!initialized}/>
//                     </W.Right>
//                 </W.Bar>
//             </W.Step>
//         )
//     }
// }
//
// export default withRecipePath()(
//     connect(mapStateToProps)(LandCoverInit)
// )
