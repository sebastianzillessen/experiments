using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Identity.Web;
using WorkHoursTracker.Api.BackgroundServices;
using WorkHoursTracker.Api.Endpoints;
using WorkHoursTracker.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Authentication — Microsoft Entra ID
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

builder.Services.AddAuthorization();

// Infrastructure (EF Core, Data Protection, Atoss client)
builder.Services.AddInfrastructure(builder.Configuration);

// Background services
builder.Services.AddHostedService<AtossCacheSyncService>();

var app = builder.Build();

// Health check (anonymous)
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// API endpoints
app.MapCheckInEndpoints();
app.MapStatusEndpoints();
app.MapUserEndpoints();

app.Run();

// Make Program accessible for WebApplicationFactory in tests
public partial class Program { }
