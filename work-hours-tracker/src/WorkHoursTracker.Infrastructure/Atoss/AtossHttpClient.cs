using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using WorkHoursTracker.Domain.Entities;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Data;

namespace WorkHoursTracker.Infrastructure.Atoss;

public class AtossCredentials
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class AtossHttpClient : IAtossClient
{
    private readonly HttpClient _httpClient;
    private readonly IDataProtector _protector;
    private readonly AppDbContext _db;

    public AtossHttpClient(HttpClient httpClient, IDataProtectionProvider protectionProvider, AppDbContext db)
    {
        _httpClient = httpClient;
        _protector = protectionProvider.CreateProtector("AtossCredentials");
        _db = db;
    }

    public async Task<IReadOnlyList<AtossTimeEntry>> GetEntriesAsync(string userId, DateOnly date, CancellationToken ct = default)
    {
        var (credentials, baseUrl) = await GetCredentialsAsync(userId, ct);
        using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/timeentries?date={date:yyyy-MM-dd}");
        AddAuth(request, credentials);

        var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var entries = await response.Content.ReadFromJsonAsync<List<AtossApiEntry>>(ct) ?? [];

        return entries.Select(e => new AtossTimeEntry
        {
            UserId = userId,
            AtossEntryId = e.Id,
            Date = date,
            StartTime = TimeOnly.Parse(e.StartTime),
            EndTime = string.IsNullOrEmpty(e.EndTime) ? null : TimeOnly.Parse(e.EndTime),
            Hours = e.Hours,
            EntryType = e.Type,
            RawJson = JsonSerializer.Serialize(e),
            LastSyncUtc = DateTime.UtcNow
        }).ToList();
    }

    public async Task<AtossTimeEntry> CheckInAsync(string userId, DateTime timeUtc, CancellationToken ct = default)
    {
        var (credentials, baseUrl) = await GetCredentialsAsync(userId, ct);
        var payload = new { timestamp = timeUtc.ToString("o"), action = "checkin" };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/timeentries/checkin");
        AddAuth(request, credentials);
        request.Content = JsonContent.Create(payload);

        var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<AtossApiEntry>(ct)
            ?? throw new InvalidOperationException("Empty response from Atoss check-in.");

        return new AtossTimeEntry
        {
            UserId = userId,
            AtossEntryId = result.Id,
            Date = DateOnly.FromDateTime(timeUtc),
            StartTime = TimeOnly.FromDateTime(timeUtc),
            EntryType = result.Type,
            RawJson = JsonSerializer.Serialize(result),
            LastSyncUtc = DateTime.UtcNow
        };
    }

    public async Task<AtossTimeEntry> CheckOutAsync(string userId, DateTime timeUtc, CancellationToken ct = default)
    {
        var (credentials, baseUrl) = await GetCredentialsAsync(userId, ct);
        var payload = new { timestamp = timeUtc.ToString("o"), action = "checkout" };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/api/timeentries/checkout");
        AddAuth(request, credentials);
        request.Content = JsonContent.Create(payload);

        var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var result = await response.Content.ReadFromJsonAsync<AtossApiEntry>(ct)
            ?? throw new InvalidOperationException("Empty response from Atoss check-out.");

        return new AtossTimeEntry
        {
            UserId = userId,
            AtossEntryId = result.Id,
            Date = DateOnly.FromDateTime(timeUtc),
            StartTime = TimeOnly.Parse(result.StartTime),
            EndTime = TimeOnly.FromDateTime(timeUtc),
            Hours = result.Hours,
            EntryType = result.Type,
            RawJson = JsonSerializer.Serialize(result),
            LastSyncUtc = DateTime.UtcNow
        };
    }

    public async Task<bool> TestConnectionAsync(string userId, CancellationToken ct = default)
    {
        try
        {
            var (credentials, baseUrl) = await GetCredentialsAsync(userId, ct);
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/api/health");
            AddAuth(request, credentials);

            var response = await _httpClient.SendAsync(request, ct);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<(AtossCredentials Credentials, string BaseUrl)> GetCredentialsAsync(string userId, CancellationToken ct)
    {
        var settings = await _db.UserSettings
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId, ct)
            ?? throw new InvalidOperationException($"No settings found for user {userId}.");

        if (string.IsNullOrEmpty(settings.AtossCredentialsEncrypted))
            throw new InvalidOperationException("Atoss credentials not configured.");

        if (string.IsNullOrEmpty(settings.AtossBaseUrl))
            throw new InvalidOperationException("Atoss base URL not configured.");

        var decrypted = _protector.Unprotect(settings.AtossCredentialsEncrypted);
        var credentials = JsonSerializer.Deserialize<AtossCredentials>(decrypted)
            ?? throw new InvalidOperationException("Failed to deserialize Atoss credentials.");

        return (credentials, settings.AtossBaseUrl.TrimEnd('/'));
    }

    private static void AddAuth(HttpRequestMessage request, AtossCredentials credentials)
    {
        var encoded = Convert.ToBase64String(
            System.Text.Encoding.UTF8.GetBytes($"{credentials.Username}:{credentials.Password}"));
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", encoded);
    }

    private class AtossApiEntry
    {
        public string Id { get; set; } = string.Empty;
        public string StartTime { get; set; } = string.Empty;
        public string EndTime { get; set; } = string.Empty;
        public double? Hours { get; set; }
        public string Type { get; set; } = string.Empty;
    }
}
