using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using Xunit;

namespace WorkHoursTracker.IntegrationTests;

public class CheckInTests : IClassFixture<WorkHoursTrackerFactory>, IAsyncLifetime
{
    private readonly WorkHoursTrackerFactory _factory;
    private HttpClient _client = null!;

    public CheckInTests(WorkHoursTrackerFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        TestAuthHandler.ResetToDefaults();
        _factory.AtossMock.Reset();
        await _factory.ClearDatabaseAsync();

        await _factory.SeedUserSettingsAsync(
            TestAuthHandler.DefaultUserId,
            _factory.AtossMock.Url!);

        _client = _factory.CreateAuthenticatedClient();
    }

    public Task DisposeAsync()
    {
        _client.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task CheckIn_CallsAtossAndCreatesSession()
    {
        // Arrange — Atoss mock returns success
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkin").UsingPost())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new
                {
                    Id = "atoss-entry-1",
                    StartTime = "09:00",
                    EndTime = "",
                    Hours = (double?)null,
                    Type = "regular"
                }));

        // Act
        var response = await _client.PostAsJsonAsync("/api/checkin", new { });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<CheckInResponse>();
        body!.SessionId.Should().BeGreaterThan(0);
        body.SyncedToAtoss.Should().BeTrue();
        body.AtossEntryId.Should().Be("atoss-entry-1");

        // Verify Atoss was actually called
        _factory.AtossMock.LogEntries.Should().Contain(e =>
            e.RequestMessage.Path == "/api/timeentries/checkin" &&
            e.RequestMessage.Method == "POST");
    }

    [Fact]
    public async Task CheckOut_CallsAtossAndUpdatesSession()
    {
        // Arrange — first check in
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkin").UsingPost())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new { Id = "atoss-entry-2", StartTime = "09:00", EndTime = "", Type = "regular" }));

        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkout").UsingPost())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new { Id = "atoss-entry-2", StartTime = "09:00", EndTime = "17:00", Hours = 8.0, Type = "regular" }));

        await _client.PostAsJsonAsync("/api/checkin", new { });

        // Act
        var response = await _client.PostAsJsonAsync("/api/checkout", new { });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var body = await response.Content.ReadFromJsonAsync<CheckOutResponse>();
        body!.CheckOutUtc.Should().NotBeNull();
        body.SyncedToAtoss.Should().BeTrue();
    }

    [Fact]
    public async Task CheckIn_WhenAlreadyCheckedIn_ReturnsConflict()
    {
        // Arrange — check in first
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkin").UsingPost())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new { Id = "atoss-entry-3", StartTime = "09:00", EndTime = "", Type = "regular" }));

        await _client.PostAsJsonAsync("/api/checkin", new { });

        // Act — try to check in again
        var response = await _client.PostAsJsonAsync("/api/checkin", new { });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task CheckOut_WhenNotCheckedIn_ReturnsConflict()
    {
        // Act
        var response = await _client.PostAsJsonAsync("/api/checkout", new { });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task CheckIn_WhenAtossDown_ReturnsError()
    {
        // Arrange — Atoss returns 500
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkin").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(500));

        // Act
        var response = await _client.PostAsJsonAsync("/api/checkin", new { });

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.BadGateway);
    }

    private record CheckInResponse(int SessionId, DateTime CheckInUtc, bool SyncedToAtoss, string? AtossEntryId);
    private record CheckOutResponse(int SessionId, DateTime CheckInUtc, DateTime? CheckOutUtc, bool SyncedToAtoss);
}
