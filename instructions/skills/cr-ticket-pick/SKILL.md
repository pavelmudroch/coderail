---
name: cr-ticket-pick
description: Select the next suitable open ticket.
disable-model-invocation: true
---
Use cli command `cr ticket next --limit=1` to view first open ticket with fulfilled dependencies, or just `cr ticket next` to view all open tickets with fulfilled dependencies, review the list and choose one that interests you.

Then implement the ticket with <skill>cr-ticket-implement</skill>.
