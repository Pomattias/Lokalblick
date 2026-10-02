# Development workflow

Lokalblick uses two parallel development streams to avoid agents overwriting each other.

## Product stream

Branch: `utveckling`

Scope:
- frontend
- UI/UX
- product model and workflows
- map presentation
- public demo
- overall repository architecture
- integration of approved backend work

This stream is managed through the ChatGPT conversation.

## Backend stream

Branch: `copilot-backend`

Scope:
- local/company backend
- source adapters
- API implementation
- backend tests
- secure local/M365 integration
- backend setup tooling and documentation

This stream is handled by Copilot.

## Integration

Copilot does not merge directly into `utveckling`.

When backend work is ready, it returns commit SHA(s). The product stream reviews the diff and then cherry-picks or merges the approved backend work into `utveckling`.

This keeps `utveckling` as the integration branch while allowing backend work to proceed independently.

## Main

`main` is not an active development branch and must not be changed unless the user explicitly approves a release.
