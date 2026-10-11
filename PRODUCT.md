# ClientFinder

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: the user accepted the recommended React web app, real map, live business search and saved leads. React with Vite and Leaflet is the selected implementation.

## Users

The owner sells websites to local businesses and uses this personal tool to find potential clients.

## Product Purpose

Discover nearby businesses and prioritize those with evidence of an unmet website need. Success means finding and reviewing a useful local prospect quickly.

## Operating Context

Search an area, adjust a radius and filters, inspect map markers and a best-first business list.

## Capabilities and Constraints

Required: interactive map, radius filters, a marker for every returned business, ranked business list, easy-to-use interface. Avoid generic AI-generated visual patterns.

The user wants to search cities and neighborhoods within cities. No single home city or preferred sector was specified. Berlin is an editable starting area only. This is a personal responsive web app; saved leads were accepted. Local notes, status tracking and CSV export support that workflow.

## Evidence on Hand

No business dataset or paid API credentials were supplied. Use public OpenStreetMap business listings with their provenance. Missing website information is a lead signal, not proof that no website exists. Scores are explainable heuristic priorities, never probabilities or invented website audits. Coverage is incomplete. Do not invent review ratings or contact details.

## Product Principles

- Put map exploration and lead comparison in one workspace.
- Explain every ranking and the limits of its source.
- Make all returned businesses reachable through map and list.
- Preserve research progress locally and make it exportable.
