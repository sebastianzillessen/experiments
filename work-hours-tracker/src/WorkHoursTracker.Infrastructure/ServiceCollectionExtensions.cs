using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using WorkHoursTracker.Domain.Interfaces;
using WorkHoursTracker.Infrastructure.Atoss;
using WorkHoursTracker.Infrastructure.Data;
using WorkHoursTracker.Infrastructure.Services;

namespace WorkHoursTracker.Infrastructure;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("DefaultConnection")));

        services.AddDataProtection()
            .PersistKeysToDbContext<AppDbContext>();

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();

        services.AddHttpClient<IAtossClient, AtossHttpClient>(client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        return services;
    }
}
