import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {}
}

class ClassificationPreview extends React.Component {
    render() {
        return <div>Classification Preview</div>
    }
}

ClassificationPreview.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ClassificationPreview)
