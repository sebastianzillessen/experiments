using Microsoft.EntityFrameworkCore;
using WorkHoursTracker.Api.Dtos;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.Api.Endpoints;

public static class StatusEndpoints
{
    public static RouteGroupBuilder MapStatusEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api").RequireAuthorization();

        group.MapGet("/status", async (
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);

            var activeSession = await db.WorkSessions
                .Where(s => s.CheckOutUtc == null)
                .OrderByDescending(s => s.CheckInUtc)
                .FirstOrDefaultAsync(ct);

            var todayEntries = await db.AtossTimeEntries
                .Where(e => e.Date == today)
                .OrderBy(e => e.StartTime)
                .ToListAsync(ct);

            var totalHours = todayEntries.Sum(e => e.Hours ?? 0);
            var lastSync = todayEntries.Any() ? todayEntries.Max(e => e.LastSyncUtc) : (DateTime?)null;

            return Results.Ok(new StatusResponse(
                IsCheckedIn: activeSession is not null,
                CurrentSessionStart: activeSession?.CheckInUtc,
                CurrentSessionDurationMinutes: activeSession is not null
                    ? (DateTime.UtcNow - activeSession.CheckInUtc).TotalMinutes
                    : null,
                TodayEntries: todayEntries.Select(e => new AtossEntryDto(
                    e.AtossEntryId,
                    e.Date.ToString("yyyy-MM-dd"),
                    e.StartTime.ToString("HH:mm"),
                    e.EndTime?.ToString("HH:mm"),
                    e.Hours,
                    e.EntryType
                )).ToList(),
                TotalHoursToday: totalHours,
                LastSyncUtc: lastSync
            ));
        });

        group.MapPost("/status/refresh", async (
            IAtossClient atossClient,
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);

            IReadOnlyList<Domain.Entities.AtossTimeEntry> freshEntries;
            try
            {
                freshEntries = await atossClient.GetEntriesAsync(currentUser.UserId, today, ct);
            }
            catch (HttpRequestException ex)
            {
                return Results.Problem(
                    detail: $"Failed to fetch from Atoss: {ex.Message}",
                    statusCode: 502);
            }

            var existing = await db.AtossTimeEntries
                .Where(e => e.Date == today)
                .ToListAsync(ct);

            db.AtossTimeEntries.RemoveRange(existing);

            foreach (var entry in freshEntries)
            {
                entry.UserId = currentUser.UserId;
                db.AtossTimeEntries.Add(entry);
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new { synced = freshEntries.Count, syncedUtc = DateTime.UtcNow });
        });

        return group;
    }
}
