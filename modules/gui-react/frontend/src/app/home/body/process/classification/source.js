import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {recipePath} from './classificationRecipe'
import styles from './source.module.css'

const fields = {}

const mapStateToProps = (state, ownProps) => {
    return {}
}

class Source extends React.Component {
    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <form>
                    <PanelHeader
                        icon='cog'
                        title={msg('process.mosaic.panel.sources.title')}/>

                    <PanelContent>
                        A panel form
                    </PanelContent>

                    <PanelButtons
                        form={form}
                        statePath={recipePath(recipeId, 'ui')}
                        onApply={(values) => console.log('onApply', values)}/>
                </form>
            </Panel>
        )
    }
}

Source.propTypes = {
    recipeId: PropTypes.string,
}

export default form({fields, mapStateToProps})(Source)
