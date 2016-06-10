/**
 * Application Events class
 *
 * @author Mino Togna
 */

Events = {
    
    AJAX: {
        REQUEST: 'ajax'
    }
    
    , APP: {
        LOAD            : 'app.load'
        , DESTROY       : 'app.destroy'
        , USER_LOGGED_IN: 'app.user-logged-in'
    }
    
    , LOGIN: {
        HIDE  : 'login.hide'
        , SHOW: 'login.show'
    }
    
    , SECTION: {
        CLOSE_ALL: 'section.close-all'
        , SHOW   : 'section.show'
        
        , REDUCE: 'section.reduce'
        
        , SEARCH: {
            // SHOW_SCENE_AREA: 'section.search.show-scene-area'
            REQUEST_SCENE_AREAS: 'section.search.request-scene-areas'
            , RETRIEVE         : 'section.search.retrieve'
            , MOSAIC           : 'section.search.mosaic'
        }
        
        , BROWSE: {
            NAV_ITEM_CLICK : 'section.browse.nav-item-click'
            , DOWNLOAD_ITEM: 'section.browse.download-item'
        }
        
        , PROCESS: {}
        
        , TERMINAL: {}
        
        , SCENE_IMAGES_SELECTION: {
            RESET     : 'section.scenes-selection.reset'
            , UPDATE  : 'section.scenes-selection.update'
            , SELECT  : 'section.scenes-selection.select'
            , DESELECT: 'section.scenes-selection.deselect'
        }
        
        , TASK_MANAGER: {
            REMOVE_TASK   : 'section.task-manager.remove-task'
            , CANCEL_TASK : 'section.task-manager.cancel-task'
            , EXECUTE_TASK: 'section.task-manager.execute-task'
        }
    }
    
    , MAP: {
        ZOOM_TO           : 'map.zoom-to'
        , LOAD_SCENE_AREAS: 'map.load-scene-areas'
        , SCENE_AREA_CLICK: 'map.scene-area-click'
        , ADD_LAYER       : 'map.add-layer'
    }
    
    // events that occur when a model changes
    , MODEL: {
        SCENE_AREA: {
            CHANGE: 'model.scene-area-change'
        }
    }
    
}

module.exports = Events