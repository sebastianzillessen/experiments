# Work Hours Tracker — Phase 1: Core Backend + PWA Check-in

## Context

Build the minimum viable product: a backend that integrates with Atoss for time tracking, plus a PWA for quick check-in/check-out from mobile. The probability engine, screen time, WiFi tracking, and advanced dashboard come later.

**What this phase delivers:**
- PWA for check-in/check-out (installable on home screen)
- Check-in/check-out fires directly to Atoss API
- Backend caches current Atoss status, refreshes every 5 min or on force refresh
- Microsoft Entra ID auth, multi-user ready (up to 400 users)
- Each user stores their Atoss credentials (encrypted at rest)

## Architecture

```
work-hours-tracker/
├── WorkHoursTracker.sln
├── src/
│   ├── WorkHoursTracker.Domain/           # Entities, interfaces, enums
│   ├── WorkHoursTracker.Infrastructure/   # EF Core, Atoss client, Data Protection
│   ├── WorkHoursTracker.Api/              # ASP.NET Minimal API + background sync service
│   └── WorkHoursTracker.Web/             # Blazor Server host + PWA static files
└── tests/
    └── WorkHoursTracker.IntegrationTests/ # E2E tests with mock Atoss API
```

- **ASP.NET Minimal APIs** (.NET 9) — backend
- **Blazor Server** — hosts API + serves static PWA files + settings page
- **Standalone HTML/JS PWA** — check-in page (offline-capable, no SignalR)
- **SQL Server** — persistence via EF Core
- **Microsoft Entra ID** — authentication
- **ASP.NET Data Protection API** — encrypts Atoss credentials at rest

## Domain Model

### Entities

```csharp
public class UserSettings
{
    public int Id { get; set; }
    public string UserId { get; set; }                    // Entra ID oid claim
    public string DisplayName { get; set; }
    public string Email { get; set; }
    public string? AtossCredentialsEncrypted { get; set; } // Data Protection API
    public string? AtossBaseUrl { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
}

public class AtossTimeEntry
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public string? AtossEntryId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }                // null = still checked in
    public double? Hours { get; set; }
    public string? EntryType { get; set; }
    public string? RawJson { get; set; }
    public DateTime LastSyncUtc { get; set; }
}

public class WorkSession
{
    public int Id { get; set; }
    public string UserId { get; set; }
    public DateTime CheckInUtc { get; set; }
    public DateTime? CheckOutUtc { get; set; }
    public string? AtossEntryId { get; set; }
    public bool SyncedToAtoss { get; set; }
    public DateTime CreatedUtc { get; set; }
}
```

### Interface

```csharp
public interface IAtossClient
{
    Task<IReadOnlyList<AtossTimeEntry>> GetEntriesAsync(string userId, DateOnly date, CancellationToken ct);
    Task<AtossTimeEntry> CheckInAsync(string userId, DateTime timeUtc, CancellationToken ct);
    Task<AtossTimeEntry> CheckOutAsync(string userId, DateTime timeUtc, CancellationToken ct);
    Task<bool> TestConnectionAsync(string userId, CancellationToken ct);
}
```

The implementation resolves user's encrypted Atoss credentials from DB before calling the Atoss API. A stub implementation (`AtossStubClient`) returns mock data for development until the real API shape is known.

## Authentication & Security

**Microsoft Entra ID:**
- `Microsoft.Identity.Web` for OIDC (Blazor) + JWT bearer (API)
- `@azure/msal-browser` (CDN) for PWA client-side auth
- `UserId` from `oid` claim on every request

**Per-user data isolation:**
- All entities have `UserId` column
- EF Core global query filter ensures users never see each other's data
- All tables indexed on `UserId`

**Atoss credentials:**
- Encrypted via `IDataProtector`, stored as blob in `UserSettings`
- Decrypted only when making Atoss API calls, never returned to client

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/checkin` | Check in — fires to Atoss, stores WorkSession |
| `POST` | `/api/checkout` | Check out — fires to Atoss, updates WorkSession |
| `GET` | `/api/status` | Current status + today's Atoss entries (from cache) |
| `POST` | `/api/status/refresh` | Force refresh Atoss cache |
| `GET` | `/api/user/settings` | Get user settings |
| `PUT` | `/api/user/atoss-credentials` | Store/update Atoss credentials |
| `GET` | `/api/health` | Health check (anonymous) |

## Background Service

**`AtossCacheSyncService`** — runs every 5 minutes:
- For each user with Atoss credentials configured
- Fetches today's entries from Atoss
- Updates `AtossTimeEntry` cache in DB
- Skips users refreshed < 5 min ago

## PWA Check-in Page

Standalone HTML/JS at `/checkin` (not Blazor — needs to work offline):
- Large check-in/check-out toggle button
- Current session timer when checked in
- Today's logged hours from cached Atoss data
- Service worker: cache-first for assets, network-first for API with IndexedDB queue
- MSAL.js for Entra ID auth
- PWA manifest for home screen install

## Blazor Pages (minimal for Phase 1)

| Page | Purpose |
|------|---------|
| Settings | Atoss credentials setup, connection test |
| Home | Link to PWA, today's Atoss summary |

## Key Files

| File | Purpose |
|------|---------|
| `src/WorkHoursTracker.Domain/Entities/UserSettings.cs` | User profile + encrypted Atoss creds |
| `src/WorkHoursTracker.Domain/Entities/AtossTimeEntry.cs` | Cached Atoss entries |
| `src/WorkHoursTracker.Domain/Entities/WorkSession.cs` | Check-in/out sessions |
| `src/WorkHoursTracker.Domain/Interfaces/IAtossClient.cs` | Atoss abstraction |
| `src/WorkHoursTracker.Infrastructure/Data/AppDbContext.cs` | EF Core context + query filters |
| `src/WorkHoursTracker.Infrastructure/Atoss/AtossHttpClient.cs` | Real Atoss HTTP client |
| `src/WorkHoursTracker.Api/Endpoints/CheckInEndpoints.cs` | Check-in/out API |
| `src/WorkHoursTracker.Api/Endpoints/StatusEndpoints.cs` | Status + refresh API |
| `src/WorkHoursTracker.Api/BackgroundServices/AtossCacheSyncService.cs` | 5-min Atoss sync |
| `src/WorkHoursTracker.Web/wwwroot/checkin/index.html` | PWA check-in page |
| `src/WorkHoursTracker.Web/wwwroot/checkin/service-worker.js` | Offline support |
| `tests/WorkHoursTracker.IntegrationTests/WorkHoursTrackerFactory.cs` | Test factory with WireMock |
| `tests/WorkHoursTracker.IntegrationTests/CheckInTests.cs` | E2E check-in/out tests |
| `tests/WorkHoursTracker.IntegrationTests/StatusTests.cs` | E2E status/refresh tests |

## E2E Integration Tests

**Approach:** Full application spin-up using `WebApplicationFactory<Program>` with a mock Atoss HTTP server. No unit tests — all tests exercise the full stack.

**Test project:** `WorkHoursTracker.IntegrationTests`

**Key NuGet packages:**
- `Microsoft.AspNetCore.Mvc.Testing` — spins up real app in-process
- `WireMock.Net` — mock HTTP server pretending to be the Atoss API
- `Microsoft.EntityFrameworkCore.InMemory` — in-memory DB for test isolation
- `xunit` + `FluentAssertions`

**Test infrastructure:**

```csharp
// Custom WebApplicationFactory that:
// 1. Replaces SQL Server with InMemory EF Core
// 2. Starts a WireMock server as the "Atoss API"
// 3. Disables Entra ID auth (replaces with test auth scheme)
// 4. Seeds a test user with Atoss credentials pointing to WireMock
public class WorkHoursTrackerFactory : WebApplicationFactory<Program>
{
    public WireMockServer AtossMock { get; }
    // ... configures services overrides in ConfigureWebHost
}
```

**WireMock Atoss mock:**
- Simulates Atoss endpoints (get entries, check-in, check-out)
- Returns configurable responses per test scenario
- Tracks received requests for assertions (verify check-in was sent to Atoss)

**Test auth:**
- Custom `AuthenticationHandler` that always succeeds with a configurable test `UserId`
- No real Entra ID calls in tests

**E2E test scenarios:**

| Test | What it verifies |
|------|-----------------|
| `CheckIn_CallsAtossAndCreatesSession` | POST /api/checkin → Atoss mock receives check-in → WorkSession stored in DB |
| `CheckOut_CallsAtossAndUpdatesSession` | POST /api/checkout → Atoss mock receives check-out → WorkSession.CheckOutUtc set |
| `Status_ReturnsCachedAtossEntries` | Seed AtossTimeEntry cache → GET /api/status → returns entries without calling Atoss |
| `StatusRefresh_FetchesFromAtoss` | POST /api/status/refresh → Atoss mock called → cache updated → GET /api/status returns new data |
| `BackgroundSync_RefreshesCache` | Trigger sync service → Atoss mock called for all configured users → cache updated |
| `CheckIn_WhenAtossDown_ReturnsError` | Configure WireMock to return 500 → POST /api/checkin → returns error, no WorkSession created |
| `MultiUser_DataIsolation` | User A checks in → User B calls GET /api/status → sees only their own data |
| `AtossCredentials_StoredEncrypted` | PUT /api/user/atoss-credentials → verify DB column is encrypted, not plaintext |
| `CheckIn_WhenAlreadyCheckedIn_ReturnsConflict` | Check in twice → second returns 409 |

## Implementation Steps

(updated from above — Step 3.5 added for test infrastructure)

### Step 1: Solution & Project Setup
- `dotnet new` for solution + 4 projects + integration test project
- NuGet for app: `Microsoft.Identity.Web`, `Microsoft.EntityFrameworkCore.SqlServer`, `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`
- NuGet for tests: `Microsoft.AspNetCore.Mvc.Testing`, `WireMock.Net`, `Microsoft.EntityFrameworkCore.InMemory`, `xunit`, `FluentAssertions`
- Project references: Api → Infrastructure → Domain, Web → Api, Tests → Web

### Step 2: Domain Layer
- Entities: `UserSettings`, `AtossTimeEntry`, `WorkSession`
- Interface: `IAtossClient`
- Enum: `SessionStatus`

### Step 3: Infrastructure Layer
- `AppDbContext` with entity configs, global query filters, indexes
- `AtossHttpClient` implementing `IAtossClient` (calls real Atoss API via `HttpClient`)
- `ICurrentUserService` to resolve `UserId` from HTTP context
- Initial EF migration

### Step 3.5: Test Infrastructure
- `WorkHoursTrackerFactory` (custom `WebApplicationFactory`)
- WireMock Atoss mock setup
- Test auth handler
- Base test class with helper methods (create authenticated client, seed data, etc.)

### Step 4: API Layer
- `Program.cs`: DI, EF Core, Entra ID auth, Data Protection
- Check-in/check-out endpoints → call `IAtossClient` → store `WorkSession`
- Status endpoint → read `AtossTimeEntry` cache
- Force refresh endpoint
- User settings + Atoss credentials endpoints
- `AtossCacheSyncService` background service
- **Write E2E tests for each endpoint as they're built**

### Step 5: PWA
- Static HTML/JS check-in page at `wwwroot/checkin/`
- MSAL.js auth integration
- Service worker with offline IndexedDB queue
- PWA manifest + placeholder icons

### Step 6: Blazor Host
- Minimal Blazor Server app hosting API + serving PWA
- Settings page for Atoss credential setup
- Home page with today's summary + PWA link

## Verification

1. `dotnet build` compiles without errors
2. `dotnet test` — all E2E integration tests pass (full app + WireMock Atoss)
3. Run app → navigate to `/checkin` → see PWA install prompt
4. Check in → Atoss API called → WorkSession created
5. Check out → Atoss API called → WorkSession updated
6. `GET /api/status` returns cached Atoss entries
7. `POST /api/status/refresh` updates cache
8. Settings page → configure Atoss credentials → test connection
