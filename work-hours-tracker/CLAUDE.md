# Work Hours Tracker — Agent Instructions

## Project Overview

ASP.NET application for tracking work hours via multiple input sources (screen time, WiFi, manual check-in) and comparing against Atoss time tracking system. Currently in Phase 1: core backend + PWA check-in.

## Architecture

- **Domain layer** (`src/WorkHoursTracker.Domain/`) — Entities, interfaces, enums. No dependencies.
- **Infrastructure layer** (`src/WorkHoursTracker.Infrastructure/`) — EF Core DbContext, Atoss HTTP client, CurrentUserService. Depends on Domain.
- **API layer** (`src/WorkHoursTracker.Api/`) — Minimal API endpoints, background services, DTOs. Depends on Infrastructure.
- **Web layer** (`src/WorkHoursTracker.Web/`) — Blazor Server host, serves PWA static files, settings pages. Depends on Api.
- **Tests** (`tests/WorkHoursTracker.IntegrationTests/`) — E2E tests using WebApplicationFactory + WireMock.Net. No unit tests.

## Key Patterns

- **Multi-user via Entra ID**: All entities have `UserId` column. `AppDbContext` applies global query filters per user.
- **IAtossClient**: Abstraction for Atoss API. `AtossHttpClient` resolves encrypted credentials from DB before each call.
- **Credentials encryption**: ASP.NET Data Protection API (`IDataProtector` with purpose `"AtossCredentials"`).
- **PWA**: Standalone HTML/JS at `wwwroot/checkin/` — not Blazor. Has service worker + IndexedDB offline queue.
- **Tests**: Full E2E with `WorkHoursTrackerFactory` (replaces SQL Server with InMemory, auth with test handler, removes background services). WireMock acts as Atoss API.

## Build & Test

```bash
cd work-hours-tracker
dotnet build WorkHoursTracker.sln
dotnet test tests/WorkHoursTracker.IntegrationTests/
```

## Key Decisions

- Blazor Server (not WASM) for dashboard — single connection, direct DB access
- PWA check-in is plain HTML/JS (not Blazor) — must work offline without SignalR
- Background sync every 5 min, skips users synced recently
- Check-in/check-out fire directly to Atoss API, not just stored locally
- Strategy pattern (`IWorkProbabilityProvider`) prepared for Phase 2 extensibility

## Adding New Input Sources (Phase 2+)

1. Create entity in `Domain/Entities/`
2. Add DbSet + config in `AppDbContext`
3. Implement `IWorkProbabilityProvider` in `Infrastructure/Probability/Providers/`
4. Register in DI
5. Add API endpoint for data ingestion in `Api/Endpoints/`
