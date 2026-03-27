using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using WorkHoursTracker.Api.Dtos;
using WorkHoursTracker.Domain.Entities;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.Api.Endpoints;

public static class UserEndpoints
{
    public static RouteGroupBuilder MapUserEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/user").RequireAuthorization();

        group.MapGet("/settings", async (
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var settings = await db.UserSettings
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.UserId == currentUser.UserId, ct);

            if (settings is null)
            {
                return Results.Ok(new UserSettingsResponse(
                    currentUser.UserId,
                    currentUser.DisplayName,
                    currentUser.Email,
                    HasAtossCredentials: false,
                    AtossBaseUrl: null));
            }

            return Results.Ok(new UserSettingsResponse(
                settings.UserId,
                settings.DisplayName,
                settings.Email,
                HasAtossCredentials: !string.IsNullOrEmpty(settings.AtossCredentialsEncrypted),
                AtossBaseUrl: settings.AtossBaseUrl));
        });

        group.MapPut("/atoss-credentials", async (
            AtossCredentialsRequest request,
            ICurrentUserService currentUser,
            IDataProtectionProvider protectionProvider,
            IAtossClient atossClient,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var protector = protectionProvider.CreateProtector("AtossCredentials");
            var credentialsJson = JsonSerializer.Serialize(new { request.Username, request.Password });
            var encrypted = protector.Protect(credentialsJson);

            var settings = await db.UserSettings
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.UserId == currentUser.UserId, ct);

            if (settings is null)
            {
                settings = new UserSettings
                {
                    UserId = currentUser.UserId,
                    DisplayName = currentUser.DisplayName,
                    Email = currentUser.Email,
                    AtossCredentialsEncrypted = encrypted,
                    AtossBaseUrl = request.BaseUrl.TrimEnd('/'),
                    CreatedUtc = DateTime.UtcNow,
                    UpdatedUtc = DateTime.UtcNow
                };
                db.UserSettings.Add(settings);
            }
            else
            {
                settings.AtossCredentialsEncrypted = encrypted;
                settings.AtossBaseUrl = request.BaseUrl.TrimEnd('/');
                settings.UpdatedUtc = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(ct);

            var connectionOk = await atossClient.TestConnectionAsync(currentUser.UserId, ct);

            return Results.Ok(new { saved = true, connectionTest = connectionOk });
        });

        return group;
    }
}
