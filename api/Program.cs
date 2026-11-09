using Amazon;
using Amazon.S3;
using Kakeibo.Api.Services;
using Kakeibo.Api.Authentication;
using Kakeibo.Api.Data;
using Kakeibo.Api.Endpoints;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<KakeiboDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddScoped<Kakeibo.Api.Services.MonthlySummaryService>();
builder.Services.AddCognitoAuthentication(builder.Configuration);
// AWS Lambda（API Gateway HTTP API）ではKestrelの代わりにLambdaランタイムで待ち受ける。
// Lambda外（ローカル・テスト）では何もしないため、通常のKestrel起動は維持される。
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);
// どのエンドポイントにも認証を必須にする。匿名を許すエンドポイントのみ明示的にAllowAnonymousを指定する
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IAmazonS3>(_ => new AmazonS3Client(new AmazonS3Config
{
    RegionEndpoint = RegionEndpoint.GetBySystemName(
        builder.Configuration["AWS_REGION"] ?? "ap-northeast-1"),
}));
builder.Services.AddScoped<ReceiptUploadUrlService>();
var app = builder.Build();

// 本番ではDDLを実行しない。開発・テストはDatabase:RunMigrationsOnStartupで明示的に有効化する。
if (DatabaseMigration.ShouldMigrate(app.Environment, app.Configuration))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<KakeiboDbContext>();
    db.Database.Migrate();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

app.MapEntriesEndpoints();
app.MapSubscriptionsEndpoints();
app.MapReceiptsEndpoints();

app.Run();

public partial class Program { }
