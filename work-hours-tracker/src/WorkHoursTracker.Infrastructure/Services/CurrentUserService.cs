using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using WorkHoursTracker.Domain.Interfaces;

namespace WorkHoursTracker.Infrastructure.Services;

public class CurrentUserService : ICurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public string UserId =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue("http://schemas.microsoft.com/identity/claims/objectidentifier")
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("User ID not found in claims.");

    public string DisplayName =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue("name")
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Name)
        ?? string.Empty;

    public string Email =>
        _httpContextAccessor.HttpContext?.User.FindFirstValue("preferred_username")
        ?? _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Email)
        ?? string.Empty;
}
