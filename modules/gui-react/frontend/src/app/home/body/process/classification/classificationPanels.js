import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'

const mapStateToProps = (state, ownProps) => {
    return {}
}

class ClassificationPanels extends React.Component {
    render() {
        return <div>Classification Panels</div>
    }
}

ClassificationPanels.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ClassificationPanels)