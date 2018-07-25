import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'

const Portal = ({container = document.body, children}) =>
    ReactDOM.createPortal(children, container)

Portal.propTypes = {
    container: PropTypes.object,
    children: PropTypes.any.isRequired
}

export default Portal