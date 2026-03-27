using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace WorkHoursTracker.IntegrationTests;

public class HealthTests : IClassFixture<WorkHoursTrackerFactory>
{
    private readonly WorkHoursTrackerFactory _factory;

    public HealthTests(WorkHoursTrackerFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsHealthy()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        body!.Status.Should().Be("healthy");
    }

    private record HealthResponse(string Status, DateTime Timestamp);
}
