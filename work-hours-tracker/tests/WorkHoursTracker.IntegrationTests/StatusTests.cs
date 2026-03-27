using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WorkHoursTracker.Api.Dtos;
using WorkHoursTracker.Domain.Entities;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.IntegrationTests;

public class StatusTests : IClassFixture<WorkHoursTrackerFactory>, IAsyncLifetime
{
    private readonly WorkHoursTrackerFactory _factory;
    private HttpClient _client = null!;

    public StatusTests(WorkHoursTrackerFactory factory)
    {
        _factory = factory;
    }

    public async Task InitializeAsync()
    {
        TestAuthHandler.ResetToDefaults();
        _factory.AtossMock.Reset();

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
    public async Task Status_ReturnsCachedAtossEntries()
    {
        // Arrange — seed cached entries
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AtossTimeEntries.Add(new AtossTimeEntry
            {
                UserId = TestAuthHandler.DefaultUserId,
                AtossEntryId = "cached-1",
                Date = DateOnly.FromDateTime(DateTime.UtcNow),
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(12, 0),
                Hours = 3.0,
                EntryType = "regular",
                LastSyncUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        }

        // Act
        var response = await _client.GetAsync("/api/status");

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var status = await response.Content.ReadFromJsonAsync<StatusResponse>();
        status!.TodayEntries.Should().HaveCountGreaterOrEqualTo(1);
        status.TotalHoursToday.Should().BeGreaterOrEqualTo(3.0);

        // Atoss mock should NOT have been called (read from cache)
        _factory.AtossMock.LogEntries.Should().NotContain(e =>
            e.RequestMessage.Path == "/api/timeentries");
    }

    [Fact]
    public async Task StatusRefresh_FetchesFromAtoss()
    {
        // Arrange
        _factory.AtossMock
            .Given(Request.Create()
                .WithPath("/api/timeentries")
                .UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new[]
                {
                    new { Id = "fresh-1", StartTime = "08:00", EndTime = "12:00", Hours = 4.0, Type = "regular" },
                    new { Id = "fresh-2", StartTime = "13:00", EndTime = "17:00", Hours = 4.0, Type = "regular" }
                }));

        // Act
        var refreshResponse = await _client.PostAsync("/api/status/refresh", null);

        // Assert
        refreshResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var statusResponse = await _client.GetAsync("/api/status");
        var status = await statusResponse.Content.ReadFromJsonAsync<StatusResponse>();
        status!.TodayEntries.Should().HaveCount(2);
        status.TotalHoursToday.Should().Be(8.0);
    }

    [Fact]
    public async Task MultiUser_DataIsolation()
    {
        // Arrange — check in as User A
        _factory.AtossMock
            .Given(Request.Create().WithPath("/api/timeentries/checkin").UsingPost())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithBodyAsJson(new { Id = "user-a-entry", StartTime = "09:00", EndTime = "", Type = "regular" }));

        var clientA = _factory.CreateAuthenticatedClient("user-a");
        await _factory.SeedUserSettingsAsync("user-a", _factory.AtossMock.Url!);
        await clientA.PostAsJsonAsync("/api/checkin", new { });

        // Act — User B checks status
        await _factory.SeedUserSettingsAsync("user-b", _factory.AtossMock.Url!);
        var clientB = _factory.CreateAuthenticatedClient("user-b");
        var response = await clientB.GetAsync("/api/status");

        // Assert — User B should NOT see User A's session
        var status = await response.Content.ReadFromJsonAsync<StatusResponse>();
        status!.IsCheckedIn.Should().BeFalse();
        status.TodayEntries.Should().BeEmpty();

        clientA.Dispose();
        clientB.Dispose();
    }
}
