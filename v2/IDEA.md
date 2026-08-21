Main cr script owns runtime infrastructure
global CLI options
config loading
--cwd
logging, colors, interactivity
repository discovery
temp directory
signal handling and cleanup
subcommand dispatch
Subcommands own domain logic
work, ticket, forge, etc. validate inputs and perform their operations
reuse runtime state initialized by cr
avoid installing their own traps or duplicating infrastructure
Use one invocation-scoped temp directory
create it once in cr
let all subcommands use files underneath it
cleanup becomes one safe operation instead of tracking arbitrary temporary paths
Use one centralized cleanup trap
owned by cr
handles temp files, spinner/activity process, terminal cleanup, and future runtime resources
subcommands only register/use shared state
Ticket state should have one source of truth
if lifecycle is represented by directory, remove state from ticket front matter
moving the ticket file becomes the lifecycle transition
avoid duplicated state that can disagree
Ticket IDs are immutable
dependencies and references use ticket IDs
paths are resolved dynamically because lifecycle directories can change
Keep ticket front matter intrinsic
ID
title
dependencies
other ticket properties
not derived lifecycle state
Add cr status
fast
read-only
summarizes current workflow state
e.g. active work, branch, idea/spec progress, ticket counts, repository state
Derive workflow phase from artifacts
do not store a separate phase=...
infer state from work.ini, IDEA.md, SPEC.md, tickets, etc.
fewer opportunities for stale metadata
Add cr doctor
deeper consistency validation
detects mismatched branch/work state, missing dependencies, duplicate IDs, broken references, malformed state, etc.
explains the problem and likely solution
Add cr doctor --repair
explicit repair mode
only repairs deterministic, safe problems
never silently guesses user intent
Keep status and doctor separate
status answers: “Where am I?”
doctor answers: “Is this state valid?”
doctor --repair answers: “Fix what can be fixed safely.”