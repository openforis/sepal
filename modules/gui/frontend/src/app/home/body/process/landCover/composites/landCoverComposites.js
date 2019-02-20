import {Button, ButtonGroup} from 'widget/button'
import {RecipeState} from '../landCoverRecipe'
import {connect, select} from 'store'
import {withRecipePath} from 'app/home/body/process/recipe'
import CompositesToolbar from './compositesToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import W from 'widget/workflow'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        status: recipeState('model.status'),
        aoi: recipeState('model.aoi'),
        tabCount: select('process.tabs').length,
    }
}

class LandCoverComposites extends React.Component {
    render() {
        const {recipeId, recipePath} = this.props
        return (
            <W.Step>
                <W.Content>
                    <MapToolbar
                        statePath={recipePath + '.ui'}
                        mapContext={recipeId}
                        labelLayerIndex={1}/>

                    <CompositesToolbar recipeId={recipeId}/>
                </W.Content>
                <W.Bar>
                    <W.Left>
                        <W.BackButton label='Init' step='init'/>
                    </W.Left>

                    <W.Center>
                        Center
                    </W.Center>

                    <W.Right>
                        <ButtonGroup>
                            <Button label={'Create composites'} look='add'/>
                            <W.NextButton label='Primitives' step='primitives'/>
                        </ButtonGroup>
                    </W.Right>
                </W.Bar>
            </W.Step>
        )
    }
}

export default withRecipePath()(
    connect(mapStateToProps)(LandCoverComposites)
)
