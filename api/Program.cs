using Kakeibo.Api.Authentication;
using Kakeibo.Api.Data;
using Kakeibo.Api.Endpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<KakeiboDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddCognitoAuthentication(builder.Configuration);
// どのエンドポイントにも認証を必須にする。匿名を許すエンドポイントのみ明示的にAllowAnonymousを指定する
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
    db.Database.Migrate();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

app.MapEntriesEndpoints();

app.Run();

public partial class Program { }
