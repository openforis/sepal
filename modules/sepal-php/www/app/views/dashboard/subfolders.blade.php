@if (isset($userFolder) && count($userFolder)>0)
{{-- */$i =0/* --}}
@foreach ($userFolder as $folderKey=>$folderValue)
{{-- */$folderwithpath =$folderPath.'/'.$folderValue;/* --}}
      {{-- */$file_ext =pathinfo($folderwithpath,PATHINFO_EXTENSION)/* --}}
      {{-- */$isdirectory = exec("sudo file -L ".$folderwithpath);/* --}}
      {{-- */$isdir = substr_compare($isdirectory, "directory", strlen($isdirectory)-strlen("directory"), strlen("directory")) === 0;/* --}}

      @if($isdir)
      @if($i==0)
      <ul>
      {{-- */$i =1/* --}}
      @endif
      <li>
      	<article style="cursor:pointer;">
      	<span class="pull-left sprite right-arrow subarrow"></span>
          <span class="sprite folder-sml pull-left"></span>
          <div  class="folderPath" path="{{ $folderPath.'/'.$folderValue }}"> {{ $folderValue }}</div>
      </article>
      <div class="subfolder" ></div>
      </li>
      @else
      @endif
      @endforeach
      @if($i==1)
      </ul>
      @endif
@endif