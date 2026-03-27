using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.Api.BackgroundServices;

public class AtossCacheSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AtossCacheSyncService> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromMinutes(5);
    private readonly TimeSpan _minTimeSinceLastSync = TimeSpan.FromMinutes(5);

    public AtossCacheSyncService(IServiceScopeFactory scopeFactory, ILogger<AtossCacheSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllUsersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during Atoss cache sync.");
            }

            await Task.Delay(_interval, stoppingToken);
        }
    }

    public async Task SyncAllUsersAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var atossClient = scope.ServiceProvider.GetRequiredService<IAtossClient>();

        var usersWithCredentials = await db.UserSettings
            .IgnoreQueryFilters()
            .Where(u => u.AtossCredentialsEncrypted != null && u.AtossBaseUrl != null)
            .Select(u => u.UserId)
            .ToListAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var cutoff = DateTime.UtcNow - _minTimeSinceLastSync;

        foreach (var userId in usersWithCredentials)
        {
            try
            {
                var recentSync = await db.AtossTimeEntries
                    .IgnoreQueryFilters()
                    .Where(e => e.UserId == userId && e.Date == today)
                    .AnyAsync(e => e.LastSyncUtc > cutoff, ct);

                if (recentSync)
                {
                    _logger.LogDebug("Skipping sync for user {UserId} — recently synced.", userId);
                    continue;
                }

                var freshEntries = await atossClient.GetEntriesAsync(userId, today, ct);

                var existing = await db.AtossTimeEntries
                    .IgnoreQueryFilters()
                    .Where(e => e.UserId == userId && e.Date == today)
                    .ToListAsync(ct);

                db.AtossTimeEntries.RemoveRange(existing);

                foreach (var entry in freshEntries)
                {
                    entry.UserId = userId;
                    db.AtossTimeEntries.Add(entry);
                }

                await db.SaveChangesAsync(ct);
                _logger.LogInformation("Synced {Count} Atoss entries for user {UserId}.", freshEntries.Count, userId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to sync Atoss for user {UserId}.", userId);
            }
        }
    }
}
