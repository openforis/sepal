/**
 * @author Mino Togna
 */
require('./process.scss')

var EventBus    = require('../event/event-bus')
var Events      = require('../event/events')
var BudgetCheck = require('../budget-check/budget-check')

var rStudioImg = require('./img/r-studio.png')
var jupyterImg = require('./img/jupyter.png')

var html              = null
var $apps             = null
var $appGroup         = null
var $btnCloseAppGroup = null

var init = function () {
  var appSection = $('#app-section').find('.process')
  if (appSection.children().length <= 0) {
    
    var template = require('./process.html')
    html         = $(template({}))
    appSection.append(html)
    
    $apps             = html.find('.apps')
    $appGroup         = html.find('.app-group')
    $btnCloseAppGroup = html.find('.btn-close-group')
    
    $btnCloseAppGroup.click(function () {
      showSection($apps)
      hideSection($appGroup)
    })
    
  }
  
  showSection($apps)
  hideSection($appGroup)
  
  BudgetCheck.check(html)
}

var setApps = function (apps) {
  $apps.empty()
  
  // data visualization app
  var dataVisBtn = $('<div><button class="btn btn-base app data-vis"><i class="fa fa-map-o" aria-hidden="true"></i> Data visualization</button></div>')
  dataVisBtn.click(function (e) {
    EventBus.dispatch(Events.APP_MANAGER.OPEN_DATAVIS)
  })
  $apps.append(dataVisBtn)
  
  // rStudio app
  var rStudioBtn = $('<div><button class="btn btn-base app r-studio"><img src="' + rStudioImg + '"/></button></div>')
  rStudioBtn.click(function (e) {
    EventBus.dispatch(Events.APP_MANAGER.OPEN_RSTUDIO, null, '/sandbox/rstudio/')
  })
  $apps.append(rStudioBtn)

  // jupyter app
  var jupyterBtn = $('<div><button class="btn btn-base app jupyter">Jupyter Notebook</button></div>')
    jupyterBtn.click(function (e) {
    EventBus.dispatch(Events.APP_MANAGER.OPEN_JUPYTER, null, '/sandbox/jupyter/tree')
  })
  $apps.append(jupyterBtn)
  
  // all other apps
  $.each(apps, function (i, app) {
    if (app.apps) {
      addAppGroup(app, $apps)
    } else {
      addAppButton(app, $apps)
    }
  })
}

var addAppButton = function (app, container) {
  var div = $('<div/>')
  
  var btn = $('<button class="btn btn-base app"></button>')
  if (app.imageUrl)
    btn.append('<img class="image-app" src="' + app.imageUrl + '"/>')
  
  btn.append('<div>' + app.label + '</div>')
  
  btn.click(function (e) {
    EventBus.dispatch(Events.APP_MANAGER.OPEN_IFRAME, null, app.path)
  })
  
  div.append(btn)
  container.append(div)
}

var addAppGroup = function (app, container) {
  var div = $('<div/>')
  
  var btn = $('<div class="btn btn-base app"></div>')
  btn.html('<i class="fa fa-folder" aria-hidden="true"></i> ' + app.label)
  
  btn.click(function (e) {
    $appGroup.find('div').remove()
    $.each(app.apps, function (i, app) {
      addAppButton(app, $appGroup)
    })
    
    hideSection($apps)
    showSection($appGroup)
    
  })
  
  div.append(btn)
  container.append(div)
}

var showSection = function (section) {
  section.velocitySlideDown({
    complete: function (elements) {
      $(elements).css('height', '100%')
    }
  })
}

var hideSection = function (section) {
  section.velocitySlideUp({
    complete: function (elements) {
      $(elements).css('height', '100%')
    }
  })
}

module.exports = {
  init     : init
  , setApps: setApps
}