/**
 * @author Mino Togna
 */
require('./scene-areas.css')

var EventBus        = require('../event/event-bus')
var Events          = require('../event/events')
var GoogleMapsLayer = require('./scene-areas-googlemaps-layer')

var zoomLevel = 3

var SceneAreasView = function () {
  this.layer   = null
  this.visible = false
}

SceneAreasView.prototype.add = function (scenes, visible) {
  this.clear()
  
  this.layer = GoogleMapsLayer.newInstance(scenes, visible, zoomLevel)
  
  EventBus.dispatch(Events.MAP.ADD_LAYER, null, this.layer)
}

SceneAreasView.prototype.clear = function () {
  if (this.layer) {
    this.layer.hide()
    this.layer.setMap(null)
    this.layer = null
  }
}

SceneAreasView.prototype.show = function () {
  if (this.layer) {
    this.layer.show()
  }
}

SceneAreasView.prototype.hide = function () {
  if (this.layer) {
    this.layer.hide()
  }
}

SceneAreasView.prototype.setCount = function (sceneAreaId, count) {
  if (this.layer) {
    
    this.layer.text(sceneAreaId)
      .attr('x', function () {
        return (count >= 10) ? 53 : 57
      })
      .transition()
      // .delay( 100 )
      .duration(400)
      .text(function (d) {
        return count
      })
    
    var bgColor = '#818181'
    if (count > 0) {
      bgColor = '#9CEBB5'
    }
    this.layer.circle(sceneAreaId)
      .transition()
      // .delay( 100 )
      .duration(400)
      .style('fill', bgColor)
      .style('stroke', bgColor)
  }
}

SceneAreasView.prototype.reset = function () {
  var $this = this
  if (this.layer) {
    $.each(this.layer.data, function (i, item) {
      var sceneArea = item.scene
      $this.setCount(sceneArea.sceneAreaId, 0)
    })
  }
}

SceneAreasView.prototype.setZoomLevel = function (value) {
  zoomLevel = value
  if (this.layer)
    this.layer.setZoomLevel(zoomLevel)
}

var newInstance = function () {
  return new SceneAreasView()
}

module.exports = {
  newInstance: newInstance
}
