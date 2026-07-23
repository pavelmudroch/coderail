---
name: cr-vizscript
description: Apply coding style and architecture guidance for VizScript.
---
Vizscript is used in 3D rendering software Viz Artist and Viz Engine.
It is based on VBScript, but has some differences.

For clarity avoid nested conditions, prefer early returns in functions, and procedures.
Variable, procedure and function names are case sensitive.

Use only APIs documented in this skill or supplied references; do not invent host APIs.

## Start here by task

- I need syntax and types, see [syntax.md](syntax.md).
- I need system invoked callback procedures, see [callbacks.md](callbacks.md).
- I need global procedures/functions (math, type conversions, string functions, UI, logging, time), see [global-procedures.md](global-procedures.md)
- I need particular api class [classes.md](classes.md)

## Used terms

* container - single scene tree node
* scene - tree of nodes representing 3D graphics
* template - form of inputs editable by user linked to the scene
* data element - stored input values filled by user in template
* TAKE-IN - action for loading and displaying content of date element into scene

## Data sharing

Scene can receive data programatically from remote system, other scene, or within scene via shared memory maps (SMM).
3 types of SMM:
- `Scene.map`: only reachable within the same scene, delete after scene close
- `System.map`: only reachable within the same engine, delte after engine close/restart, retain values on scene close
- `VizCommunication.map`: reachable through multiple engines, stored in shared DB, but not reliable - clients started after the change do not receive it automatically

### Quick reference

write to map `System.map["key"] = "some value"`
read key `dim value = CStr(System.map["key"])`, by default map returns a `Variant` type, thus should be converted to desired output
watch key changes `System.map.RegisterChangedCallback("key")`
wath all keys `System.map.RegisterChangedCallback("")`
stop watching key `System.map.UnregisterChangedCallback("key")`
stop watching all `System.mapUnregisterChangedCallback("")`

Valid for all types of map `System`, `Scene`, `VizCommunication`.