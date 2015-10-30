@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'group'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('users', 'List Users') }}</li>
        </ul>                
 <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>  
    </div>
</section>
  <!--popup loading div start here -->
        <div class="popup-wrap" id="help-popup-wrap" style="display: none;">
            <div class="popup-container">
                <a class="close close-btn" id="help-close-button" href="#">x</a>
                <div class="popup-heading"><h5 class="text-left">List user</h5></div>
                <p class="text-left marg-no">This interface allows administrators to update user information, reset a password, and modify the group a user belongs to.</p>
            </div>
        </div>
        <!--popup loading div end here -->
<!--
{{ HTML::link('adduser', 'Add User') }}-->



       <!--content wrap start-->
        <section class="content-wrap">
          <div class="container">
              <h2>List user</h2> 

@if(Session::has('group-message'))
<div style="color:red;">{{ Session::get('group-message') }}</div>
@endif 
              {{ Form::open(array('url'=>'users','method'=>'post')) }}       
                <div class="box-wrap" style="padding-top:15px;">
                  <ul class="row">                      
                        <li class="col-lg-6 adjest_w">
                          <ul class="user_listing">
                              <li>
                                  <span>Select Group</span>
                                   @if(count($datalist['groupList'])>0)
                                  
                                  {{ Form::select('group', $datalist['groupList'],$value = (Input::old('group')?Input::old('group'):(isset($groupDetailDb->id)?$groupDetailDb->id:'')),array('id'=>'group')) }}
                                  {{Form::submit('Assign Group',array('class'=>'smallbuttonblue button'))}}
                                    @endif

                                    
                                </li>
                            </ul>
                            <div class="clearfix"></div>
                        </li>
                        
                    </ul>  
                    <div class="clearfix"></div>
                    <div class="table_user_list">

                      <table>
                      @if (!empty($userLists))
                              <tr>
                                <th scope="col">Select</th>
                                <th scope="col">Name</th>
                                <th scope="col">User Name</th>
                                <th scope="col">Email</th>
                                <th scope="col">Role</th>
                                <th scope="col">Group</th>
                                <th scope="col">Action</th>
                              </tr>
                               @foreach ($userLists as $userList)
                              
                              <tr>
                                <td>{{Form::checkbox('user_checked[]', $userList->id);}}</td>
                                <td>{{ $userList->full_name }}</td>
                                <td>{{ $userList->username }}</td>
                                <td>{{ $userList->email }}</td>
                                <td>
                                   @foreach($userList->roles as $role)
                                   {{$role->role_name}}
                                   @endforeach
                                </td>
{{-- */$group_ids = Session::get('group_id');/* --}}
{{-- */$row_groups = false;/* --}}
                                <td>


                                @foreach($userList->userGroups as $group)
								
                                <span class="grp_style ugroup_{{$group->group_id}}_{{$userList->id}}">
                                    {{$group->group_id}}
			@if(Session::get('is_admin')=='yes' || in_array($group->group_id,$group_ids))
			{{-- */$row_groups = true;/* --}}
                                    {{ HTML::link('removegroup', 'x',array('id'=>$group->group_id,'rel' =>$userList->id,'class'=>'removeGroup')) }}
			@endif
                                </span>
                                @endforeach

                                </td>
                                <td id="user_{{$userList->id}}">
@if(Session::get('is_admin')=='yes' || $row_groups == true)
                                {{ HTML::link('users/edit/'.$userList->id, 'Edit',array('class'=>'button action_btn')) }}
                                {{ HTML::link('users/del/'.$userList->id, 'Delete',array('class'=>'button action_btn')) }}
@endif
                                </td>
                              </tr>
                              @endforeach
                      @else
                          <tr>
                            <th align="center"> No matching records found!</th>
                          </tr>
                      @endif
                            </table>

                    
                    </div>                
              {{Form::close()}}  
                </div>
                




                <!-- pagination start here -->
                    <div class="pagination-wrap">
                        <span class="pull-left">Displaying {{ $userLists->getFrom() }} - {{ $userLists->getTo() }} of 
                        {{ number_format($userLists->getTotal()) }} results</span>
                        <div class="clearboth"></div>
                        {{ $userLists->links() }}
                    </div>
                    <!-- pagination end here -->
                
            </div>
        </section>
        <!--content wrap end-->




@stop 
