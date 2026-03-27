using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Identity.Web;
using Microsoft.Identity.Web.UI;
using WorkHoursTracker.Api.BackgroundServices;
using WorkHoursTracker.Api.Endpoints;
using WorkHoursTracker.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Authentication — Microsoft Entra ID (OIDC for Blazor + JWT for API)
builder.Services.AddAuthentication(OpenIdConnectDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApp(builder.Configuration.GetSection("AzureAd"))
    .EnableTokenAcquisitionToCallDownstreamApi()
    .AddInMemoryTokenCaches();

builder.Services.AddAuthentication()
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"), jwtBearerScheme: "Bearer");

builder.Services.AddAuthorization();
builder.Services.AddControllersWithViews()
    .AddMicrosoftIdentityUI();

// Blazor Server
builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();

// Infrastructure (EF Core, Data Protection, Atoss client)
builder.Services.AddInfrastructure(builder.Configuration);

// Background services
builder.Services.AddHostedService<AtossCacheSyncService>();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

// API endpoints
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));
app.MapCheckInEndpoints();
app.MapStatusEndpoints();
app.MapUserEndpoints();

// Blazor
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");

app.Run();

// Make Program accessible for WebApplicationFactory in tests
public partial class Program { }
