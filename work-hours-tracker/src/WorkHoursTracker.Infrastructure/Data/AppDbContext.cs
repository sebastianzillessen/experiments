using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using WorkHoursTracker.Domain.Entities;
using WorkHoursTracker.Domain.Interfaces;

namespace WorkHoursTracker.Infrastructure.Data;

public class AppDbContext : DbContext, IDataProtectionKeyContext
{
    private readonly ICurrentUserService? _currentUser;

    public AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUserService? currentUser = null)
        : base(options)
    {
        _currentUser = currentUser;
    }

    public DbSet<UserSettings> UserSettings => Set<UserSettings>();
    public DbSet<AtossTimeEntry> AtossTimeEntries => Set<AtossTimeEntry>();
    public DbSet<WorkSession> WorkSessions => Set<WorkSession>();
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<UserSettings>(entity =>
        {
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.Property(e => e.UserId).HasMaxLength(128).IsRequired();
            entity.Property(e => e.DisplayName).HasMaxLength(256);
            entity.Property(e => e.Email).HasMaxLength(256);
        });

        modelBuilder.Entity<AtossTimeEntry>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.UserId, e.Date });
            entity.Property(e => e.UserId).HasMaxLength(128).IsRequired();
            entity.Property(e => e.AtossEntryId).HasMaxLength(256);
            entity.Property(e => e.EntryType).HasMaxLength(64);

            if (_currentUser is not null)
            {
                entity.HasQueryFilter(e => e.UserId == _currentUser.UserId);
            }
        });

        modelBuilder.Entity<WorkSession>(entity =>
        {
            entity.HasIndex(e => e.UserId);
            entity.HasIndex(e => new { e.UserId, e.CheckInUtc });
            entity.Property(e => e.UserId).HasMaxLength(128).IsRequired();
            entity.Property(e => e.AtossEntryId).HasMaxLength(256);

            if (_currentUser is not null)
            {
                entity.HasQueryFilter(e => e.UserId == _currentUser.UserId);
            }
        });
    }
}
