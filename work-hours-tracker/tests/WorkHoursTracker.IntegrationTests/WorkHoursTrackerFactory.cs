using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using WireMock.Server;
using WorkHoursTracker.Infrastructure.Data;
using Xunit;

namespace WorkHoursTracker.IntegrationTests;

public class WorkHoursTrackerFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly string _dbName = $"TestDb_{Guid.NewGuid()}";

    public WireMockServer AtossMock { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        AtossMock = WireMockServer.Start();
        await Task.CompletedTask;
    }

    public new async Task DisposeAsync()
    {
        AtossMock?.Stop();
        AtossMock?.Dispose();
        await base.DisposeAsync();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureServices(services =>
        {
            // Remove the real SQL Server DbContext registration
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();

            // Add InMemory database with a stable name per factory instance
            services.AddDbContext<AppDbContext>((sp, options) =>
            {
                options.UseInMemoryDatabase(_dbName);
            });

            // Replace authentication with test scheme
            services.AddAuthentication(TestAuthHandler.SchemeName)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    TestAuthHandler.SchemeName, _ => { });

            // Remove hosted services (background sync) to avoid interference
            var hostedServices = services.Where(
                d => d.ServiceType == typeof(Microsoft.Extensions.Hosting.IHostedService))
                .ToList();
            foreach (var hs in hostedServices)
                services.Remove(hs);
        });
    }

    public HttpClient CreateAuthenticatedClient(string? userId = null)
    {
        if (userId != null)
            TestAuthHandler.CurrentUserId = userId;
        else
            TestAuthHandler.ResetToDefaults();

        return CreateClient();
    }

    public async Task SeedUserSettingsAsync(string userId, string atossBaseUrl)
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var protectionProvider = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>();
        var protector = protectionProvider.CreateProtector("AtossCredentials");

        var credentials = System.Text.Json.JsonSerializer.Serialize(new { Username = "testuser", Password = "testpass" });
        var encrypted = protector.Protect(credentials);

        // Avoid duplicate seeding
        var existing = await db.UserSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId);

        if (existing is not null)
        {
            existing.AtossCredentialsEncrypted = encrypted;
            existing.AtossBaseUrl = atossBaseUrl;
            existing.UpdatedUtc = DateTime.UtcNow;
        }
        else
        {
            db.UserSettings.Add(new Domain.Entities.UserSettings
            {
                UserId = userId,
                DisplayName = "Test User",
                Email = "test@example.com",
                AtossCredentialsEncrypted = encrypted,
                AtossBaseUrl = atossBaseUrl,
                CreatedUtc = DateTime.UtcNow,
                UpdatedUtc = DateTime.UtcNow
            });
        }

        await db.SaveChangesAsync();
    }

    public async Task ClearDatabaseAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        db.WorkSessions.RemoveRange(db.WorkSessions.IgnoreQueryFilters());
        db.AtossTimeEntries.RemoveRange(db.AtossTimeEntries.IgnoreQueryFilters());
        db.UserSettings.RemoveRange(db.UserSettings.IgnoreQueryFilters());
        await db.SaveChangesAsync();
    }
}
