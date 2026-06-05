using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WorkHoursTracker.Api.Dtos;
using WorkHoursTracker.Infrastructure.Data;
using Xunit;

namespace WorkHoursTracker.IntegrationTests;

public class UserSettingsTests : IClassFixture<WorkHoursTrackerFactory>, IAsyncLifetime
{
    private readonly WorkHoursTrackerFactory _factory;
    private HttpClient _client = null!;

    public UserSettingsTests(WorkHoursTrackerFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        TestAuthHandler.ResetToDefaults();
        _factory.AtossMock.Reset();
        await _factory.ClearDatabaseAsync();
        _client = _factory.CreateAuthenticatedClient();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task GetSettings_ReturnsDefaultsForNewUser()
    {
        // Act
        var response = await _client.GetAsync("/api/user/settings");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var settings = await response.Content.ReadFromJsonAsync<UserSettingsResponse>();
        settings!.HasAtossCredentials.Should().BeFalse();
        settings.AtossBaseUrl.Should().BeNull();
    }

    [Fact]
    public async Task AtossCredentials_StoredEncrypted()
    {
        // Arrange
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/health").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200));

        // Act
        var response = await _client.PutAsJsonAsync("/api/user/atoss-credentials", new
        {
            Username = "myuser",
            Password = "mysecretpassword",
            BaseUrl = _factory.AtossMock.Url!
        });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        // Verify the credentials are encrypted in the DB
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var settings = await db.UserSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == TestAuthHandler.DefaultUserId);

        settings.Should().NotBeNull();
        settings!.AtossCredentialsEncrypted.Should().NotBeNullOrEmpty();
        settings.AtossCredentialsEncrypted.Should().NotContain("mysecretpassword");
        settings.AtossCredentialsEncrypted.Should().NotContain("myuser");
    }

    [Fact]
    public async Task AtossCredentials_ConnectionTestReturned()
    {
        // Arrange — Atoss health returns OK
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/health").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200));

        // Act
        var response = await _client.PutAsJsonAsync("/api/user/atoss-credentials", new
        {
            Username = "user",
            Password = "pass",
            BaseUrl = _factory.AtossMock.Url!
        });

        // Assert
        var body = await response.Content.ReadFromJsonAsync<CredentialsSaveResponse>();
        body!.Saved.Should().BeTrue();
        body.ConnectionTest.Should().BeTrue();
    }

    private record CredentialsSaveResponse(bool Saved, bool ConnectionTest);
}
