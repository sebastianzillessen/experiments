using WorkHoursTracker.Domain.Entities;

namespace WorkHoursTracker.Domain.Interfaces;

public interface IAtossClient
{
    Task<IReadOnlyList<AtossTimeEntry>> GetEntriesAsync(string userId, DateOnly date, CancellationToken ct = default);
    Task<AtossTimeEntry> CheckInAsync(string userId, DateTime timeUtc, CancellationToken ct = default);
    Task<AtossTimeEntry> CheckOutAsync(string userId, DateTime timeUtc, CancellationToken ct = default);
    Task<bool> TestConnectionAsync(string userId, CancellationToken ct = default);
}
