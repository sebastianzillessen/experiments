namespace WorkHoursTracker.Api.Dtos;

public record CheckInRequest(DateTime? TimestampUtc = null);

public record CheckOutRequest(DateTime? TimestampUtc = null);

public record CheckInBatchAction(string Action, DateTime TimestampUtc);

public record CheckInBatchRequest(List<CheckInBatchAction> Actions);
