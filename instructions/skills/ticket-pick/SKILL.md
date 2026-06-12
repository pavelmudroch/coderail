---
name: ticket-pick
description: Guidance and criteria for picking an open project ticket for implementation.
---
First pick the ticket. Use `tools/ticket.sh claim` to automatically claim first open ticket with fulfilled dependencies.
Or use `tools/ticket.sh next` to view all open tickets with fulfilled dependencies, review the list and choose one that interests you, then call `tools/ticket.sh activate <ticket-id>` to claim it for yourself.

Then implement the ticket with <skill>ticket-implement</skill>.
