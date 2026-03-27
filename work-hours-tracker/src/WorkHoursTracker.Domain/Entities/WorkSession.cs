namespace WorkHoursTracker.Domain.Entities;

public class WorkSession
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTime CheckInUtc { get; set; }
    public DateTime? CheckOutUtc { get; set; }
    public string? AtossEntryId { get; set; }
    public bool SyncedToAtoss { get; set; }
    public DateTime CreatedUtc { get; set; }
}
