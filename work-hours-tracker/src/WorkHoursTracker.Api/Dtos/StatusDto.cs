namespace WorkHoursTracker.Api.Dtos;

public record StatusResponse(
    bool IsCheckedIn,
    DateTime? CurrentSessionStart,
    double? CurrentSessionDurationMinutes,
    List<AtossEntryDto> TodayEntries,
    double TotalHoursToday,
    DateTime? LastSyncUtc);

public record AtossEntryDto(
    string? AtossEntryId,
    string Date,
    string StartTime,
    string? EndTime,
    double? Hours,
    string? EntryType);
