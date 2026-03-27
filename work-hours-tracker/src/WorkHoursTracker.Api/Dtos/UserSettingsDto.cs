namespace WorkHoursTracker.Api.Dtos;

public record UserSettingsResponse(
    string UserId,
    string DisplayName,
    string Email,
    bool HasAtossCredentials,
    string? AtossBaseUrl);

public record AtossCredentialsRequest(
    string Username,
    string Password,
    string BaseUrl);
