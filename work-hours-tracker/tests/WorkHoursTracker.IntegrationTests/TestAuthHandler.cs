using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace WorkHoursTracker.IntegrationTests;

public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "TestScheme";
    public const string DefaultUserId = "test-user-001";
    public const string DefaultDisplayName = "Test User";
    public const string DefaultEmail = "test@example.com";

    public static string CurrentUserId { get; set; } = DefaultUserId;
    public static string CurrentDisplayName { get; set; } = DefaultDisplayName;
    public static string CurrentEmail { get; set; } = DefaultEmail;

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, CurrentUserId),
            new Claim("http://schemas.microsoft.com/identity/claims/objectidentifier", CurrentUserId),
            new Claim("name", CurrentDisplayName),
            new Claim("preferred_username", CurrentEmail),
            new Claim(ClaimTypes.Name, CurrentDisplayName),
            new Claim(ClaimTypes.Email, CurrentEmail),
        };

        var identity = new ClaimsIdentity(claims, SchemeName);
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, SchemeName);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }

    public static void ResetToDefaults()
    {
        CurrentUserId = DefaultUserId;
        CurrentDisplayName = DefaultDisplayName;
        CurrentEmail = DefaultEmail;
    }
}
