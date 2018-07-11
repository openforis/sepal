import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'

const mapStateToProps = (state, ownProps) => {
    return {}
}

class ClassificationToolbar extends React.Component {
    render() {
        return <div>Classification Toolbar</div>
    }
}

ClassificationToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ClassificationToolbar)