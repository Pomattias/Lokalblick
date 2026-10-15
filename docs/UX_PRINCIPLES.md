# Lokalblick UX principles

This note complements `ARCHITECTURE.md`. It describes the product interaction model, not a specific visual design.

## Core model

Lokalblick is driven by two independent concepts:

1. **Selection** — what the user is looking at: all, area, responsible person, property, contract.
2. **Perspective** — what the user wants to understand or do: overview, maintenance, projects, drift, contracts, wishes.

Selection is shared application state. Changing perspective must not ask for the same selection again.

## Interaction order

Use this order whenever possible:

```
overview -> selection -> relevant information -> detail -> action
```

Prefer expanding or replacing detail in the same workspace over opening a new page or modal.

## Mobile

Mobile is task-first. Show one primary work surface at a time, large touch targets, progressive disclosure, and a stable bottom dock.

## Desktop

Desktop is not an enlarged mobile screen. Use the width for simultaneous context and detail:

- current selection remains visible
- perspective is a compact text/tab control
- summary sits directly above the records that create it
- lists and rows are denser than mobile cards
- Planera, Karta and Budget keep the same shared selection

## Visual roles

Keep a small vocabulary:

- primary action: creates, saves or commits a real change
- secondary action: local supporting action
- navigation/perspective: text/tab control, not a large CTA
- filter/selection: scope control
- status: badge/pill
- warning: only for something requiring attention
- summary: quiet KPI
- expandable information: row/details pattern

If everything looks clickable and important, the hierarchy has failed.

## Data sources

The user-facing concept is **Datakällor**, not API.

Local demo/dev may use a local Excel connector. Production connections such as Microsoft 365 and external systems run through the authenticated Lokalblick backend and provider adapters. Credentials, API keys and raw customer master data never belong in the browser UI.

A future source-management API should let authorized administrators create, test and enable backend connector configurations without changing the rest of the frontend. The normalized Lokalblick model remains the contract.

## Code rule

Do not create a second implementation of the same selection/filter behavior for another view. Reuse the same state and source records. Device-specific composition is acceptable; duplicated business logic is not.
