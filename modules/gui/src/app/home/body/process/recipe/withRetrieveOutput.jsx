import React from 'react'
import {ReactReduxContext} from 'react-redux'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputWatch} from './outputWatch'
import {IMAGE_OUTPUT} from './recipeOutput'
import {readRetrieveOutput} from './retrieveOutput'

// Gives a Retrieve panel the read of its recipe's image output, and watches that question for as long as the panel is
// open. The source runtime loads what the read needs, shared with a map layer asking the same question, and holds it
// for as long as either watches it; closing one never cancels what the other still needs (outputWatch.js).
//
//   retrieveOutput      the read this render was made from: {recipe, output, pending}
//   readRetrieveOutput  the read as the session stands at the moment it is called, for a submission to decide from
//
// Both read the store the panel is rendered under, rather than the props a render was given, so a submission cannot
// decide from a render that the session has since moved past. The connected graph only makes a change to any record
// it holds re-render the panel, as a map layer's does.
//
// `isImageOutput` says whether the panel's request is about the recipe's image output at all; one that is not reads
// and watches nothing.

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
        watch = new OutputWatch({
            sourceRuntime: this.props.sourceRuntime,
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
            this.watch.stop()
        }

        update() {
            const {recipeId} = this.props
            isImageOutput(this.props)
                ? this.watch.update({recipeId, product: {name: IMAGE_OUTPUT}})
                : this.watch.stop()
        }

        read() {
            const {recipeId, sourceRuntime} = this.props
            return readRetrieveOutput({
                state: this.context.store.getState(),
                recipeId,
                heldFor: key => sourceRuntime.heldFor(key)
            })
        }
    }

    return compose(
        RetrieveOutputOwner,
        connect(mapStateToProps),
        withSourceRuntime()
    )
}
