// import {withRecipe} from 'app/home/body/process/recipeContext'
// import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
// import InitToolbar from './initToolbar'
// import MapToolbar from 'app/home/map/mapToolbar'
// import Period from './period'
// import React from 'react'
// import W from 'widget/workflow'

// const recipeToProps = recipe => {
//     const model = recipe.model
//     return {
//         nextDisabled: !model.aoi || !model.period || !model.typology
//     }
// }

// class LandCoverInit extends React.Component {
//     render() {
//         const {nextDisabled, recipeContext: {recipeId, statePath}} = this.props
//         return (
//             <W.Step>
//                 <W.Content>
//                     <Aoi recipeId={recipeId}/>
//                     <Period recipeId={recipeId}/>
//                     {/*<Typology recipeId={recipeId}/>*/}

//                     <MapToolbar
//                         statePath={statePath + '.ui'}
//                         mapContext={recipeId}
//                         labelLayerIndex={1}/>

//                     <InitToolbar recipeId={recipeId}/>
//                 </W.Content>
//                 <W.Bar>
//                     <W.Center>
//                         Specify Area of interest, time period, and typology.
//                     </W.Center>
//                     <W.Right>
//                         <W.NextButton
//                             label='Composites'
//                             step='composites'
//                             disabled={nextDisabled}
//                         />
//                     </W.Right>
//                 </W.Bar>
//             </W.Step>
//         )
//     }
// }

// export default withRecipe(recipeToProps)(
//     LandCoverInit
// )
