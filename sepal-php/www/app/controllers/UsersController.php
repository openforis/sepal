<?php

class UsersController extends \BaseController {

    protected $layout = 'layouts.master';

    function __construct() {
        $this->beforeFilter(function() {
                    if (Session::get('is_admin') == 'yes') {
                        
                    } else if (Session::get('group_admin') == 'yes' && Session::get('group_id') > 0) {
                        
                    } else {
                        return Redirect::to('search')
                                        ->with('error', 'Permission denied!');
                    }
                });
    }

    //POST process form inputs from add Roles form
    public function create() {
        // Validation rules
        $rules = array(
            'firstName' => 'required|min:4|max:50',
            'userName' => 'required|min:1|max:20|unique:users,username',
            'email' => 'required|email|max:120|unique:users,email', //TBD unique:users
            'password' => array('required', 'regex:$\S*(?=\S{8,})(?=\S*[a-z])(?=\S*[A-Z])(?=\S*[\d])\S*$'),
            'confirmPassword' => 'required|same:password'
        );
        $messages = array(
            'password.regex' => 'Password must contain atleast one lowercase letter, one uppercase letter, one number and a minimum of 8 characters.',
        );
        // Validate the inputs
        $v = Validator::make(Input::all(), $rules, $messages);

        // Setting attribute for readable format   
        $attributeNames = array(
            'firstName' => 'first name',
            'userName' => 'user name',
            'email' => 'email',
            'password' => 'password',
            'confirmPassword' => 'confirm password'
        );
        $v->setAttributeNames($attributeNames);

        // Was the validation successful?
        if ($v->fails()) {
            return Redirect::to('adduser')
                            ->withErrors($v)
                            ->withInput();
        } else {

            $user = new User;
            $user->username = Input::get('userName');
            $user->full_name = Input::get('firstName');
            $user->email = Input::get('email');
            // save user
            if ($user->save()) {
                $insertedUserId = $user->id;

                $username = Input::get('userName');
                $password = Input::get('password');
                $group_id = Input::get('group');
                $sshConnection = ssh2_connect(SdmsConfig::value('hostSSH'), 22);
                $sshAuthConnection=@ssh2_auth_password($sshConnection, SdmsConfig::value('adminUser'), SdmsConfig::value('adminPwd'));
                $script = "echo sudopw | ".SdmsConfig::value('createUserScript')." ".$username." ". $password. " ".$group_id.PHP_EOL;
                Logger::debug('Data Script: ', $script);
                $stream = ssh2_exec($sshConnection,$script);
                stream_set_blocking($stream, true);
                $stream_out = ssh2_fetch_stream($stream, SSH2_STREAM_STDIO);
                $user->user_uid = stream_get_contents($stream_out);
                Logger::debug('UserCreatedId: ',$user->user_uid);
                $user->save();
                $homeDir = SdmsConfig::value('dataHome');
                $userHomeDir = $homeDir."/".$username;
                $publicHomeDir= SdmsConfig::value('publicHomeDir');
                Logger::debug('Ownership Flags: ', "sudo chown -R ".intval($user->user_uid).":sepal ".$userHomeDir);
                exec("sudo mkdir -p -m 770 ".$userHomeDir);
                exec("sudo mkdir -p -m 770 ".$userHomeDir."/sdmsrepository");
                exec("sudo mkdir -p -m 770 ".$userHomeDir."/layers");
                exec("sudo mkdir  -p -m 700 ".$userHomeDir."/.ssh");
                exec("sudo chmod -R g+s ".$userHomeDir);
                exec("sudo chown -R ".intval($user->user_uid).":sepal ".$userHomeDir);
                exec("sudo mkdir ".$publicHomeDir."/".$username);
                exec("sudo chown ".intval($user->user_uid)." /public/".$username);
                exec("sudo ln -s ".$publicHomeDir." ".$userHomeDir."/");
                $logged_in_user = Auth::id();
                //only admin can assign role. Else role 'user' by default.
                if (Session::get('is_admin') == 'yes') {
                    $role_id = Input::get('role');
                    //if($role_id =="") $role_id =1;
                }else
                    $role_id = "";
                $group_id = Input::get('group');
                $group_admin = Input::get('group_admin');
                $date = new \DateTime;
                //if success, add role to the user.
                if ($role_id > 0) {
                    $user->roles()->attach($role_id, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date));
                }
                //if success, add group (if any selected)to the user.

                if (strlen($group_id) > 0) {

                    $userGroup = new Usergroup;
                    $userGroup->user_id = $insertedUserId;
                    $userGroup->created_by = $logged_in_user;
                    $userGroup->group_id = $group_id;
                    $userGroup->is_group_admin = $group_admin;
                    $userGroup->save();
                    //$user->groups()->attach($group_id,array('created_by'=>$logged_in_user,'created_at'=>$date,'updated_at'=>$date,'is_group_admin'=>$group_admin));
                }
            }

            return Redirect::to('users')
                            ->with('message', 'User added!');
        }

        //return View::make('success');
    }

    //POST process form inputs from add Roles form
    public function update($id = NULL) {
        //check if logged in user has access to edit the page
        $access = $this->checkUSerAccess($id);
        if ($access == false)
            return Redirect::to('users')
                            ->with('error', 'Permission denied!');
        // Validation rules
        $rules = array(
            'firstName' => 'required|min:4|max:50',
            'userName' => 'required|min:1|max:20|unique:users,username,' . $id . '',
            'email' => 'required|email|max:120|unique:users,email,' . $id . '',
            'password' => array('regex:$\S*(?=\S{8,})(?=\S*[a-z])(?=\S*[A-Z])(?=\S*[\d])\S*$'),
            'confirmPassword' => 'same:password'
        );
        $messages = array(
            'password.regex' => 'Password must contain atleast one lowercase letter, one uppercase letter, one number and a minimum of 8 characters.',
        );
        // Validate the inputs
        $v = Validator::make(Input::all(), $rules, $messages);

        // Setting attribute for readable format   
        $attributeNames = array(
            'firstName' => 'first name',
            'userName' => 'user name',
            'email' => 'email',
            'password' => 'password',
            'confirmPassword' => 'confirm password'
        );
        $v->setAttributeNames($attributeNames);

        // Was the validation successful?
        if ($v->fails()) {
            return Redirect::to('/users/edit/' . $id)
                            ->withErrors($v)
                            ->withInput();
        } else {



            $user = User::find($id);
            $user->username = Input::get('userName');
            $user->full_name = Input::get('firstName');
            $user->email = Input::get('email');
            // save user
            $logged_in_user = Auth::id();
            if ($user->save()) {

                /* Resetting password linux user */
                $password = Input::get('password');
                $username = Input::get('userName');
                if (strlen(trim($password)) > 3) {
                    /* Handling linux user handing */

                    $password = Input::get('password');
                    $groupname = $username;
                    $tmpfname = tempnam('/tmp/', 'chpasswd');
                    $handle = fopen($tmpfname, "w");
                    fwrite($handle, "$username:" . crypt($password) . "\n");
                    fclose($handle);
                    shell_exec("sudo sh -c \"chpasswd -e < $tmpfname\"");

                    /* Handling linux user handing */
                }
                $group_id = Input::get('group');
                if (strlen($group_id) > 2) {
                    exec("sudo usermod -a -G $group_id $username");
                }
                /* Resetting password linux user */

                //update roles & groups only if not his profile
                $role_id = Input::get('role');
                $group_id = Input::get('group');
                $group_admin = Input::get('group_admin');
                $date = new \DateTime;
                //if success, add role to the user only if logged in user has admin access
                if (Session::get('is_admin') == 'yes') {
                    $role_id = Input::get('role');
                    if ($role_id > 0) {
                        $user->roles()->detach();
                        $user->roles()->attach($role_id, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date));
                    }
                }

                //if success, add group (if any selected)to the user.
                if ($group_id > 0) {
                    $user->groups()->detach($group_id, array());

                    $user->groups()->attach($group_id, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date, 'is_group_admin' => $group_admin));
                }
            }

            return Redirect::to('users')
                            ->with('message', 'User added!');
        }

        //return View::make('success');
    }

    public function add() {

        //get roles
        $rolesListsDB = Role::get();
        $roleList = array();
        $roleList[''] = '-Select a role-';
        foreach ($rolesListsDB as $roleListDB) {
            $roleList[$roleListDB->id] = $roleListDB->role_name;
        }
        $dataToView['roleList'] = $roleList;
        //admin users can assign users to any group, group admin users can assign users to their groups only
        $groupsListsDB = $this->getGroupLIst();

        $groupList = array();
        $groupList[''] = '-Select a group-';
        //exec("cut -d: -f1 /etc/group",$groupLists);
        $groupLists = $this->getGroups();
        $currentData = array();
        $groupSystem = GroupSystem::get();
        if (!empty($groupSystem)) {
            foreach ($groupSystem as $groupData) {

                $currentData[] = $groupData->group_name;
            }
        }

        foreach ($groupLists as $groupKey => $groupValue) {
            if (!in_array($groupValue, $currentData)) {
                $groupList[$groupValue] = $groupValue;
            }
        }


        //only to group admin
        if (Session::get('group_admin') == 'yes') {
            $logged_in_userid = Auth::id();
            $userGroupList = Usergroup::where('user_id', '=', $logged_in_userid)
                    ->where('is_group_admin', '=', 1)
                    ->get();
            if (isset($userGroupList) && count($userGroupList) > 0) {
                $groupList = array();
                $groupList[''] = '-Select a group-';
                foreach ($userGroupList as $valGroup) {
                    $groupList[$valGroup->group_id] = $valGroup->group_id;
                }
            }
            $dataToView['groupList'] = $groupList;
        } else {
            $dataToView['groupList'] = $groupList;
        }


        $this->layout->content = View::make('users.userform', $dataToView);
    }

    public function edit($id = NULL) {
        //check if logged in user has access to edit the page
        $access = $this->checkUSerAccess($id);
        if ($access == false)
            return Redirect::to('users')
                            ->with('error', 'Permission denied!');
        //get roles
        $rolesListsDB = Role::get();
        $roleList = array();
        $roleList[''] = '-Select a role-';
        foreach ($rolesListsDB as $roleListDB) {
            $roleList[$roleListDB->id] = $roleListDB->role_name;
        }
        $dataToView['roleList'] = $roleList;

        //admin users can assign users to any group, group admin users can assign users to their groups only
        $groupsListsDB = $this->getGroupLIst();
        $groupList = array();
        $groupList[''] = '-Select a group-';


        //exec("sudo cut -d: -f1 /etc/group",$groupLists);
        $groupLists = $this->getGroups();
        $currentData = array();
        $groupSystem = GroupSystem::get();
        if (!empty($groupSystem)) {
            foreach ($groupSystem as $groupData) {

                $currentData[] = $groupData->group_name;
            }
        }

        foreach ($groupLists as $groupKey => $groupValue) {
            if (!in_array($groupValue, $currentData)) {
                $groupList[$groupValue] = $groupValue;
            }
        }

        //only to group admin
        if (Session::get('group_admin') == 'yes') {
            $logged_in_userid = Auth::id();
            $userGroupList = Usergroup::where('user_id', '=', $logged_in_userid)
                    ->where('is_group_admin', '=', 1)
                    ->get();
            if (isset($userGroupList) && count($userGroupList) > 0) {
                $groupList = array();
                $groupList[''] = '-Select a group-';
                foreach ($userGroupList as $valGroup) {
                    $groupList[$valGroup->group_id] = $valGroup->group_id;
                }
            }
            $dataToView['groupList'] = $groupList;
        } else {
            $dataToView['groupList'] = $groupList;
        }


        $userDetailDb = User::with('groups', 'roles')->find($id);
        $userGroupDetailDb = Usergroup::where('user_id', '=', $id)->get();

        $dataToView['userGroupDetailDb'] = $userGroupDetailDb;
        $dataToView['userDetailDb'] = $userDetailDb;
        $dataToView['userLoginId'] = Auth::id();
        $this->layout->content = View::make('users.userform', $dataToView);
    }

    //GET display collection of users 
    public function index() {
        $userListDB = new User;

        //initializing number of results per page
        //need to change pagelimit to perPage
        $perPage = Input::get('pagelimit');
        $perPage = $perPage > 0 ? $perPage : 50;

        //
        $method = Request::method();
        //assign group submission
        if (Request::isMethod('post')) {
            $groupid = Input::get('group');
            $userids = Input::get('user_checked');
            if ($userids) {
                foreach ($userids as $userid) {
                    $user = User::find($userid);
                    if ($user && $groupid != "") {
                        //detach group if exists and assign new
                        //cheeck if normal or admin user
                        $useraccessadmin = $this->getUserRoleAccess($userid);
                        if (!$useraccessadmin) {

                            if ((strlen($user->username) > 2) && (strlen($groupid) > 2)) {
                                //exec("sudo usermod -a -G $groupid $user->username");

                                    $groupFolderPathUser = "../../../../data/home/shared-$groupid/";
                                    if (!file_exists($groupFolderPathUser)) {
                                        exec("sudo mkdir $groupFolderPathUser");
                                        exec("sudo chown -R root:$groupid /data/home/shared-$groupid");
                                        exec("sudo chmod -R 770 /data/home/shared-$groupid");
                                    }
                            }

                            $user->groups()->detach($groupid, array());
                            $logged_in_user = Auth::id();
                            $date = new \DateTime;
                            $user->groups()->attach($groupid, array('created_by' => $logged_in_user, 'created_at' => $date, 'updated_at' => $date));
                        } else {
                            Session::flash('group-message', 'Groups cannot be assigned to admin users');
                        }
                    }
                }
            }
        }

        $userList = $userListDB->getUsers($perPage);


        //GET GROUPS
        //admin users can assign users to any group, group admin users can assign users to their groups only
        $groupsListsDB = $this->getGroupLIst();

        $groupList = array();
        $groupList[''] = '-Select a group-';
        //exec("sudo cut -d: -f1 /etc/group",$groupLists);
        $groupLists = $this->getGroups();
        $currentData = array();
        $groupSystem = GroupSystem::get();
        if (!empty($groupSystem)) {
            foreach ($groupSystem as $groupData) {
                $currentData[] = $groupData->group_name;
            }
        }
        foreach ($groupLists as $groupKey => $groupValue) {
            if (!in_array($groupValue, $currentData)) {
                $groupList[$groupValue] = $groupValue;
            }
        }


        //only to group admin
        if (Session::get('group_admin') == 'yes') {
            $logged_in_userid = Auth::id();
            $userGroupList = Usergroup::where('user_id', '=', $logged_in_userid)
                    ->where('is_group_admin', '=', 1)
                    ->get();
            if (isset($userGroupList) && count($userGroupList) > 0) {
                $groupList = array();
                $groupList[''] = '-Select a group-';
                foreach ($userGroupList as $valGroup) {
                    $groupList[$valGroup->group_id] = $valGroup->group_id;
                }
            }
            $dataToView['groupList'] = $groupList;
        } else {
            $dataToView['groupList'] = $groupList;
        }

        //finally render our template.
        $this->layout->content = View::make('users.user', array('userLists' => $userList, 'perPage' => $perPage, 'datalist' => $dataToView));
        $this->layout->heading = 'Users';
    }

    function removeUser($userId = NULL) {
        //check if logged in user has access to remove user
        $access = $this->checkUSerAccess($userId);
        if ($access == false)
            return Redirect::to('users')
                            ->with('error', 'Permission denied!');
        $this->layout = '';

        $user = User::find($userId);
        //delete the user and corresponding user group ids and roles
        if ($user->delete()) {
            $user->groups()->detach();
            $user->roles()->detach();
        }
        return Redirect::to('users')
                        ->with('message', 'User removed!');
    }

    function removeGroup() {

        $this->layout = '';
        $groupId = Input::get('groupId');
        $userId = Input::get('userId');
        //check if logged in user has access to remove group
        $group_ids = Session::get('group_id');
        if (Session::get('is_admin') == 'yes' || in_array($groupId, $group_ids)) {
            $user = User::find($userId);
            if ($user) {//detach group 
                $usergroup = new Usergroup;
                $usergroup->where('user_id', '=', $userId)->where('group_id', '=', $groupId)->delete();
                if ((strlen($user->username) > 2) && (strlen($groupId) > 2)) {
                    //echo "sudo gpasswd -d $user->username $groupId";
                    exec("sudo gpasswd -d $user->username $groupId");
                }


                if (Session::get('is_admin') == 'yes') {
                    echo "true-true";
                    exit();
                } else {
                    $user_groups_sel = $user->userGroups;
                    $user_groups_sel_names = $user_groups_sel->lists('group_id');
                    $group_common = array_intersect($user_groups_sel_names, $group_ids);
                    if (count($group_common) > 0) {
                        echo "true-true";
                        exit();
                    } else {
                        echo "true-false";
                        exit();
                    }
                }
            }
        }
        echo "false-false";
        exit();
    }
    /**
     * Get group ids of logged in user
     *
     * @return array
     */
    public function getUserGroups($userid) {
        $user = User::find($userid);
        if (!$user)
            return array();
        $groups = $user->groups;
        if ($groups) {
            $groupIds = $groups->lists('id');
            return $groupIds;
        }else
            return array();
    }

    /**
     * check if a user has admin access
     *
     * @return boolean
     */
    public function getUserRoleAccess($userid) {
        $user = User::find($userid);
        if (!$user)
            return false;
        $roles = $user->roles;
        if ($roles) {
            $roleIds = $roles->lists('id');
            if (in_array(2, $roleIds) || in_array(3, $roleIds)) {
                return true;
            }
        }else
            return false;
    }

    /**
     * Get groups according to the logged in user
     *
     * @return array
     */
    public function getGroupLIst() {
        //admin users can assign users to any group, group admin users can assign users to their groups only
        $logged_in_userid = Auth::id();
        if (Session::get('is_admin') == 'yes') {
            $groupsListsDB = Group::orderBy('group_name', 'ASC')->get();
        } else if (Session::get('group_admin') == 'yes' && Session::get('group_id') > 0) {
            $group_ids = Session::get('group_id');
            $groupsListsDB = Group::select('groups.id', 'group_name')->leftJoin('users_groups', 'groups.id', '=', 'users_groups.group_id')->where('user_id', $logged_in_userid)->whereIn('group_id', $group_ids)->orderBy('group_name', 'ASC')->get();
        } else {
            $groupsListsDB = Group::orderBy('group_name', 'ASC')->get();
        }
        return $groupsListsDB;
    }

    /*
     * Check if a user has access to a edit a normal user
     *
     */

    function checkUSerAccess($id = NULL) {
        $access = false;
        if (Session::get('is_admin') == 'yes')
            $access = true;
        if (Session::get('group_admin') == 'yes') {
            if ($id != NULL) {
                $user = User::find($id);
                $user_groups_sel = $user->userGroups;
                $usergroups = $user_groups_sel->lists('group_id');
                $group_ids = Session::get('group_id');
                $group_common = array_intersect($usergroups, $group_ids);
                if (count($group_common) > 0)
                    $access = true;
            }
        }
        return $access;
    }

    /*
     * function to get linux groups excluding base linux groups
     *
     */

    function getGroups() {
        exec("sudo cut -d: -f1 /etc/group", $groupLists);
        $restrictedGroups = RestrictedGroup::get(array('name'))->lists('name');
        //remove base linux groups to hide them in UI
        $groupList = array_diff($groupLists, $restrictedGroups);
        return $groupList;
    }

}

?>
