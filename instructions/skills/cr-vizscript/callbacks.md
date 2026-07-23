## OnInit

For script variables initialization, scene tree reads use `OnInit()` callback.

```vb
dim myContainer as Container

sub OnInit()
    myContainer = Scene.FindContainer("myContainer")
end sub
```

## OnInitParameters

Creating UI buttons, inputs, etc. use `OnInitParameters()` callback.

```vb
sub OnInitParameters()
    ' Register all UI items here
end sub
```

## OnExecPerField

Periodic computation use `OnExecPerField()` callback. It is run exactly once per rendered field. It is hot path, heavy computations or scene tree lookups should be avoided here, instead of lookups use cached references. Use early returns to skip unnecessary per-field work.
Assume 50 fields per second. Under heavy load, frequency may drop, but that is considered a performance problem.

```vb
sub OnExecPerField()
    ' Do periodic computations here
end sub
```

```vb
dim myCounter as Integer = 0

sub OnExecPerField()
    myCounter = myCounter + 1
    if myCounter <> 50 then exit sub
    myCounter = 0
    ' Do something every second
end sub
```

```vb
dim myContainer as Container

sub OnInit()
    myContainer = Scene.FindContainer("myContainer")
end sub

sub OnExecPerField()
    ' use stored reference instead of lookup
    myContainer.Position.x = myContainer.Position.x + 1
end sub
```

## OnExecAction

Called when user clicks registered UI button. This is suitable for development scripted tools when user is designing scene. In production (OnAir mode), there is no user interaction UI, os it will never be called. Thus performance of this callback is not critical.

```vb
sub OnExecAction(buttonId as Integer)
    ' Resolve button by id with if, select case, or dictionary lookup
    select case buttonId
        case 1
            ' Do something for button 1
        case 2
            ' Do something for button 2
        case else
            ' Do something for unknown button
    end select
end sub
```

## OnParameterChanged

Use when tracing registered UI input changes. Not applicable for production (OnAir mode), so performance is not critical.

```vb
sub OnParameterChanged(paramName as String)
    ' Resolve parameter by name with if, select case, or dictionary lookup
    select case paramName
        case "myInput"
            ' Do something for myInput change
        case "myCheckbox"
            ' Do something for myCheckbox change
        case else
            ' Do something for unknown parameter
    end select
end sub
```

## OnSharedMemoryVariableChanged & OnSharedMemoryVariableDeleted

Use when tracing changes in shared memory map.
There are 2 gotchas:
1. Deleted key changed to empty string "" is not reported as change.
2. Key containing empty string "" is not reported as delete when deleted.

Watching for deleteion is not needed for most cases.

```vb
sub OnSharedMemoryVariableChanged(map as SharedMemory, key as String)
    ' Filter here by map and/or key if multiple maps or keys are registered for change watch
    dim value as Variant = map[key]
end sub
```

```vb
sub OnSharedMemoryVariableDeleted(map as SharedMemory, key as String)
    ' Filter here by map and/or key if multiple maps or keys are registered for deletion watch
end sub
```

## OnGeometryChanged

Use when watching containers geometry changes. When multiple geometries are watched, it is needed to store reference for each watched geometry for comparison.

Usecase:
When container geometry is text, and has control plugin to link text content with data element input field, then callback can be used for monitoring different data element TAKE-IN action, because control plugin overrides the container geometry text content from data element.

```vb
dim myWatchedGeometry as Geometry

sub OnInit()
    myWatchedGeometry = Scene.FindContainer("myContainer").Geometry
end sub

sub OnGeometryChanged(geom as Geometry)
    ' look up geometry with if, or select case
    if geom <> myWatchedGeometry then exit sub
    dim value as String = geom.Text
    ' do something
end sub
```

## OnRequestStatusUpdate

Use when need watch for asynchronous operation result, especially when texture or geometry is created without freezing render with background loading (`Container.CreateTextureBgl` or `Container.CreateGeometryBgl`). Mostly useful when checking whether status is 0 - success, otherwise perform backup action, or compute dimensions when texture or geometry is loaded and container got new shape or size.

```vb
sub OnRequestStatusUpdate(requestId as Integer, status as Integer, objectId as Integer)
end sub
```