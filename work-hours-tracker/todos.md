# Work Hours Tracker — TODO

## Phase 1: Core Backend + PWA (Current)

### Done
- [x] Solution structure (Domain, Infrastructure, Api, Web, IntegrationTests)
- [x] Domain entities: UserSettings, AtossTimeEntry, WorkSession
- [x] IAtossClient interface + AtossHttpClient implementation
- [x] AppDbContext with global query filters for multi-user isolation
- [x] CurrentUserService (resolves UserId from Entra ID claims)
- [x] API endpoints: checkin, checkout, status, status/refresh, user/settings, user/atoss-credentials
- [x] AtossCacheSyncService (background sync every 5 min)
- [x] PWA check-in page (HTML/JS, service worker, offline IndexedDB queue)
- [x] Blazor Server host with Home dashboard + Settings page
- [x] E2E integration tests with WebApplicationFactory + WireMock.Net
- [x] Microsoft Entra ID auth setup (OIDC + JWT bearer)
- [x] Atoss credentials encrypted at rest via Data Protection API

### TODO
- [ ] Configure real Azure AD app registration (TenantId, ClientId, ClientSecret)
- [ ] Set up SQL Server and run initial EF Core migration (`dotnet ef migrations add Initial`)
- [ ] Generate proper PWA icons (192x192, 512x512)
- [x] Test full E2E flow with `dotnet test` — 12/12 tests passing
- [ ] Deploy to Azure hosting environment
- [ ] Configure real Atoss API base URL and test connection

## Phase 2: Probability Engine (Future)

- [ ] Screen time data collection (Python agent on Mac)
- [ ] WiFi network tracking (Python agent)
- [ ] IWorkProbabilityProvider strategy pattern + provider implementations
- [ ] ProbabilityEngine (weighted aggregation)
- [ ] ProbabilityComputeService (background recomputation)
- [ ] Discrepancy detection (NotLogged, OverLogged)
- [ ] Dashboard: probability timeline chart (Chart.js)
- [ ] Dashboard: discrepancy alerts
- [ ] Dashboard: weekly overview / heatmap

## Phase 3: Advanced Features (Future)

- [ ] Additional input sources (calendar, VPN, badge reader)
- [ ] Bayesian probability model upgrade
- [ ] Auto-suggest Atoss entries from high-probability unlogged slots
- [ ] Admin view for system-wide settings
- [ ] Rate limiting on API endpoints
- [ ] Docker Compose for development environment
- [ ] Mobile-responsive Blazor dashboard
