import {compose} from 'compose'
import {defaultModel} from './landCoverRecipe2'
import {recipe} from 'app/home/body/process/recipeContext'
import LandCoverComposites from 'app/home/body/process/landCover/composites/landCoverComposites'
import LandCoverInit from 'app/home/body/process/landCover/init/landCoverInit'
import React from 'react'
import Workflow from 'widget/workflow'

class LandCover extends React.Component {
    render() {
        return (
            <Workflow
                start='init'
                steps={{
                    init: <LandCoverInit/>,
                    composites: <LandCoverComposites/>
                }}
            />
        )
    }
}

export default compose(
    LandCover,
    recipe(defaultModel)
)

// import LandCoverComposites from 'app/home/body/process/landCover/composites/landCoverComposites'
// import LandCoverInit from 'app/home/body/process/landCover/init/landCoverInit'
// import {recipe} from 'app/home/body/process/recipe'
// import {setAoiLayer} from 'app/home/map/aoiLayer'
// import React from 'react'
// import {connect, select} from 'store'
// import Workflow from 'widget/workflow'
// import {RecipeState} from './landCoverRecipe'
// import {sepalMap} from 'app/home/map/map'
//
// const mapStateToProps = (state, ownProps) => {
//     const recipeState = ownProps.recipeState
//     return {
//         step: recipeState('model.step'),
//         aoi: recipeState('model.aoi'),
//         tabCount: select('process.tabs').length,
//     }
// }
//
// class LandCover extends React.Component {
//     render() {
//         const {recipeId} = this.props
//         return (
//             <Workflow
//                 start='init'
//                 steps={{
//                     init: <LandCoverInit recipeId={recipeId}/>,
//                     composites: <LandCoverComposites recipeId={recipeId}/>
//                 }}
//             />
//         )
//     }
//
//     componentDidMount() {
//         const {recipeId, aoi, componentWillUnmount$} = this.props
//         setAoiLayer({
//             contextId: recipeId,
//             aoi,
//             destroy$: componentWillUnmount$,
//             onInitialized: () => {
//                 if (this.props.tabCount === 1) {
//                     sepalMap.setContext(recipeId)
//                     sepalMap.getContext(recipeId).fitLayer('aoi')
//                 }
//             }
//         })
//     }
// }
//
// export default recipe(RecipeState)(
//     connect(mapStateToProps)(LandCover)
// )
