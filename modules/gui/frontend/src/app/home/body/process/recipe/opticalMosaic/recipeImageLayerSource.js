// import {OpticalMosaicImageLayerSource} from './opticalMosaicImageLayerSource'
// import {compose} from 'compose'
// import {connect} from 'store'
// import {msg} from 'translate'
// import {recipeAccess} from '../../recipeAccess'
// import {selectFrom} from 'stateUtils'
// import {withMapAreaContext} from 'app/home/map/mapAreaContext'
// import Notifications from 'widget/notifications'
// import PropTypes from 'prop-types'
// import React from 'react'
//
// const mapStateToProps = (state, {source: {recipeId}}) => ({
//     recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
// })
//
// class _RecipeImageLayerSource extends React.Component {
//     render() {
//         return <div>Image layer source</div>
//     }
//
//     componentDidMount() {
//         const {stream, source, loadRecipe$} = this.props
//         const recipeId = source.sourceConfig.recipeId
//         stream('LOAD_IMAGE_LAYER_SOURCE_RECIPE',
//             loadRecipe$(recipeId),
//             recipe => this.updateRecipeDetails(recipe),
//             // TODO: Update error message
//             error => Notifications.error({message: msg('process.timeSeries.panel.sources.classificationLoadError', {error}), error})
//         )
//
//     }
//
//     componentDidUpdate() {
//         const {recipe} = this.props
//         console.log('update')
//         this.updateRecipeDetails(recipe)
//     }
//
//     updateRecipeDetails(recipe) {
//         const {mapAreaContext: {updateLayerConfig}} = this.props
//         const details = {
//             description: recipe.title || recipe.placeholder,
//             type: recipe.type
//         }
//         updateLayerConfig({details})
//     }
// }
//
// const RecipeImageLayerSource = compose(
//     _RecipeImageLayerSource,
//     connect(mapStateToProps),
//     withMapAreaContext(),
//     recipeAccess()
// )
//
// RecipeImageLayerSource.propTypes = {
//     source: PropTypes.object.isRequired,
//     layerConfig: PropTypes.object,
//     map: PropTypes.object
// }
//
