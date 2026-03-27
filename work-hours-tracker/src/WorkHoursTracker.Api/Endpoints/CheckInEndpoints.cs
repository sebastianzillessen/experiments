using Microsoft.EntityFrameworkCore;
using WorkHoursTracker.Api.Dtos;
using WorkHoursTracker.Domain.Entities;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.Api.Endpoints;

public static class CheckInEndpoints
{
    public static RouteGroupBuilder MapCheckInEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api").RequireAuthorization();

        group.MapPost("/checkin", async (
            CheckInRequest? request,
            IAtossClient atossClient,
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var activeSession = await db.WorkSessions
                .Where(s => s.CheckOutUtc == null)
                .OrderByDescending(s => s.CheckInUtc)
                .FirstOrDefaultAsync(ct);

            if (activeSession is not null)
                return Results.Conflict(new { error = "Already checked in.", sessionStart = activeSession.CheckInUtc });

            var timestamp = request?.TimestampUtc ?? DateTime.UtcNow;

            AtossTimeEntry? atossEntry = null;
            try
            {
                atossEntry = await atossClient.CheckInAsync(currentUser.UserId, timestamp, ct);
            }
            catch (HttpRequestException ex)
            {
                return Results.Problem(
                    detail: $"Failed to check in with Atoss: {ex.Message}",
                    statusCode: 502);
            }

            var session = new WorkSession
            {
                UserId = currentUser.UserId,
                CheckInUtc = timestamp,
                AtossEntryId = atossEntry?.AtossEntryId,
                SyncedToAtoss = atossEntry is not null,
                CreatedUtc = DateTime.UtcNow
            };

            db.WorkSessions.Add(session);

            if (atossEntry is not null)
            {
                atossEntry.UserId = currentUser.UserId;
                db.AtossTimeEntries.Add(atossEntry);
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                sessionId = session.Id,
                checkInUtc = session.CheckInUtc,
                syncedToAtoss = session.SyncedToAtoss,
                atossEntryId = session.AtossEntryId
            });
        });

        group.MapPost("/checkout", async (
            CheckOutRequest? request,
            IAtossClient atossClient,
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var activeSession = await db.WorkSessions
                .Where(s => s.CheckOutUtc == null)
                .OrderByDescending(s => s.CheckInUtc)
                .FirstOrDefaultAsync(ct);

            if (activeSession is null)
                return Results.Conflict(new { error = "Not currently checked in." });

            var timestamp = request?.TimestampUtc ?? DateTime.UtcNow;

            AtossTimeEntry? atossEntry = null;
            try
            {
                atossEntry = await atossClient.CheckOutAsync(currentUser.UserId, timestamp, ct);
            }
            catch (HttpRequestException ex)
            {
                return Results.Problem(
                    detail: $"Failed to check out with Atoss: {ex.Message}",
                    statusCode: 502);
            }

            activeSession.CheckOutUtc = timestamp;
            activeSession.SyncedToAtoss = atossEntry is not null;
            if (atossEntry?.AtossEntryId is not null)
                activeSession.AtossEntryId = atossEntry.AtossEntryId;

            if (atossEntry is not null)
            {
                var existingEntry = await db.AtossTimeEntries
                    .IgnoreQueryFilters()
                    .FirstOrDefaultAsync(e => e.AtossEntryId == atossEntry.AtossEntryId && e.UserId == currentUser.UserId, ct);

                if (existingEntry is not null)
                {
                    existingEntry.EndTime = atossEntry.EndTime;
                    existingEntry.Hours = atossEntry.Hours;
                    existingEntry.RawJson = atossEntry.RawJson;
                    existingEntry.LastSyncUtc = DateTime.UtcNow;
                }
                else
                {
                    atossEntry.UserId = currentUser.UserId;
                    db.AtossTimeEntries.Add(atossEntry);
                }
            }

            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                sessionId = activeSession.Id,
                checkInUtc = activeSession.CheckInUtc,
                checkOutUtc = activeSession.CheckOutUtc,
                syncedToAtoss = activeSession.SyncedToAtoss
            });
        });

        group.MapPost("/checkin/batch", async (
            CheckInBatchRequest request,
            IAtossClient atossClient,
            ICurrentUserService currentUser,
            AppDbContext db,
            CancellationToken ct) =>
        {
            var results = new List<object>();

            foreach (var action in request.Actions.OrderBy(a => a.TimestampUtc))
            {
                try
                {
                    if (action.Action.Equals("checkin", StringComparison.OrdinalIgnoreCase))
                    {
                        var atossEntry = await atossClient.CheckInAsync(currentUser.UserId, action.TimestampUtc, ct);
                        var session = new WorkSession
                        {
                            UserId = currentUser.UserId,
                            CheckInUtc = action.TimestampUtc,
                            AtossEntryId = atossEntry.AtossEntryId,
                            SyncedToAtoss = true,
                            CreatedUtc = DateTime.UtcNow
                        };
                        db.WorkSessions.Add(session);
                        atossEntry.UserId = currentUser.UserId;
                        db.AtossTimeEntries.Add(atossEntry);
                        results.Add(new { action = action.Action, timestamp = action.TimestampUtc, success = true });
                    }
                    else if (action.Action.Equals("checkout", StringComparison.OrdinalIgnoreCase))
                    {
                        var atossEntry = await atossClient.CheckOutAsync(currentUser.UserId, action.TimestampUtc, ct);
                        var activeSession = await db.WorkSessions
                            .Where(s => s.CheckOutUtc == null)
                            .OrderByDescending(s => s.CheckInUtc)
                            .FirstOrDefaultAsync(ct);

                        if (activeSession is not null)
                        {
                            activeSession.CheckOutUtc = action.TimestampUtc;
                            activeSession.SyncedToAtoss = true;
                        }
                        results.Add(new { action = action.Action, timestamp = action.TimestampUtc, success = true });
                    }
                }
                catch (Exception ex)
                {
                    results.Add(new { action = action.Action, timestamp = action.TimestampUtc, success = false, error = ex.Message });
                }
            }

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { results });
        });

        return group;
    }
}
