import React from 'react'
import {ReactReduxContext} from 'react-redux'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputAcquisition} from './outputAcquisition'
import {readRetrieveOutput} from './retrieveOutput'

// Gives a Retrieve panel the read of its recipe's image output, and acquires what that read needs for as long as
// the panel is open. The panel owns its own acquisition, never a map layer's: their lifetimes are unrelated.
//
//   retrieveOutput      the read this render was made from: {recipe, output, pending}
//   readRetrieveOutput  the read as the session stands at the moment it is called, for a submission to decide from
//
// Both read the store the panel is rendered under, rather than the props a render was given, so a submission cannot
// decide from a render that the session has since moved past. The connected graph only makes a change to any record
// it holds re-render the panel, as a map layer's does.
//
// `isImageOutput` says whether the panel's request is about the recipe's image output at all; one that is not reads
// and acquires nothing.

const mapStateToProps = (state, {recipeId}) => {
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes')
    const recipe = loadedRecipes?.[recipeId]
    return {
        retrieveGraph: recipe ? buildMapDependencyGraph({recipe, loadedRecipes}) : null
    }
}

export const withRetrieveOutput = ({isImageOutput = () => true} = {}) => WrappedComponent => {
    class RetrieveOutputOwner extends React.Component {
        static contextType = ReactReduxContext

        mounted = false
        acquisition = new OutputAcquisition({
            sourceRuntime: this.props.sourceRuntime,
            currentGraph: () => this.read()?.graph,
            onChange: () => this.mounted && this.forceUpdate()
        })

        constructor(props) {
            super(props)
            this.read = this.read.bind(this)
        }

        render() {
            const {retrieveGraph: _retrieveGraph, sourceRuntime: _sourceRuntime, ...props} = this.props
            return isImageOutput(this.props)
                ? <WrappedComponent {...props} retrieveOutput={this.read()} readRetrieveOutput={this.read}/>
                : <WrappedComponent {...props}/>
        }

        componentDidMount() {
            this.mounted = true
            this.update()
        }

        componentDidUpdate() {
            this.update()
        }

        componentWillUnmount() {
            this.mounted = false
            this.acquisition.stop()
        }

        update() {
            const read = isImageOutput(this.props) && this.read()
            read
                ? this.acquisition.update(read.output.acquisition, read.recipe)
                : this.acquisition.stop()
        }

        read() {
            return readRetrieveOutput({
                state: this.context.store.getState(),
                recipeId: this.props.recipeId,
                heldFor: key => this.acquisition.heldFor(key),
                publishedEvidence: this.props.sourceRuntime.publishedEvidence
            })
        }
    }

    return compose(
        RetrieveOutputOwner,
        connect(mapStateToProps),
        withSourceRuntime()
    )
}
