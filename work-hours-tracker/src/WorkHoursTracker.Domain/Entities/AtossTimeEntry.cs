namespace WorkHoursTracker.Domain.Entities;

public class AtossTimeEntry
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string? AtossEntryId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly? EndTime { get; set; }
    public double? Hours { get; set; }
    public string? EntryType { get; set; }
    public string? RawJson { get; set; }
    public DateTime LastSyncUtc { get; set; }
}
