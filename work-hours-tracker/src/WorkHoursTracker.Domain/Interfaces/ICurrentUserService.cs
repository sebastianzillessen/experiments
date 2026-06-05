namespace WorkHoursTracker.Domain.Interfaces;

public interface ICurrentUserService
{
    string UserId { get; }
    string DisplayName { get; }
    string Email { get; }
}
