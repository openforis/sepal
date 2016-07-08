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
            FORM_SUBMIT         : 'section.search.form-submit'
            , SCENE_AREAS_LOADED: 'section.search.scene-areas-loaded'
            , RETRIEVE          : 'section.search.retrieve'
            , MOSAIC            : 'section.search.mosaic'
        }
        
        , BROWSE: {
            NAV_ITEM_CLICK : 'section.browse.nav-item-click'
            , DOWNLOAD_ITEM: 'section.browse.download-item'
        }
        
        , PROCESS: {}
        
        , TERMINAL: {}
        
        , SCENES_SELECTION: {
            // RESET                     : 'section.scenes-selection.reset'
            UPDATE                    : 'section.scenes-selection.update'
            , SELECT                  : 'section.scenes-selection.select'
            , DESELECT                : 'section.scenes-selection.deselect'
            , SORT_CHANGE             : 'section.scenes-selection.sort-change'
            , FILTER_SHOW_SENSOR      : 'section.scenes-selection.filter-show-sensor'
            , FILTER_HIDE_SENSOR      : 'section.scenes-selection.filter-hide-sensor'
            , FILTER_TARGET_DAY_CHANGE: 'section.scenes-selection.filter-target-day-change'
        }
        
        , TASK_MANAGER: {
            REMOVE_TASK   : 'section.task-manager.remove-task'
            , CANCEL_TASK : 'section.task-manager.cancel-task'
            , EXECUTE_TASK: 'section.task-manager.execute-task'
            , CHECK_STATUS: 'section.task-manager.check-status'
        }
        
        , USER: {
            REMOVE_SESSION: 'section.user.remove-session'
        }
    }
    
    , MAP: {
        ZOOM_TO           : 'map.zoom-to'
        // , LOAD_SCENE_AREAS: 'map.load-scene-areas'
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