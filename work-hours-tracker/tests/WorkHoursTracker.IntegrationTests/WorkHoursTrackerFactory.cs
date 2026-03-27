using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WireMock.Server;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.IntegrationTests;

public class WorkHoursTrackerFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
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
        builder.ConfigureServices(services =>
        {
            // Remove the real SQL Server DbContext
            var descriptor = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (descriptor != null)
                services.Remove(descriptor);

            // Add InMemory database
            services.AddDbContext<AppDbContext>((sp, options) =>
            {
                options.UseInMemoryDatabase($"TestDb_{Guid.NewGuid()}");
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
        var protectionProvider = scope.ServiceProvider.GetRequiredService<Microsoft.AspNetCore.DataProtection.IDataProtectionProvider>();
        var protector = protectionProvider.CreateProtector("AtossCredentials");

        var credentials = System.Text.Json.JsonSerializer.Serialize(new { Username = "testuser", Password = "testpass" });
        var encrypted = protector.Protect(credentials);

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

        await db.SaveChangesAsync();
    }
}
