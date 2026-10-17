using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Kakeibo.Api.Authentication;

/// <summary>
/// Cognito発行のJWT（アクセストークン）を検証する認証を登録する。
/// 検証内容：署名がUser PoolのJWKS鍵と一致、発行者（iss）が設定したUser Poolと一致、
/// 期限切れでない、token_use=access、client_idが設定したApp Clientと一致。
/// IDトークンや別User Poolのトークンは401（未認証）になる。
/// </summary>
public static class CognitoAuthenticationExtensions
{
    public static IServiceCollection AddCognitoAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var cognito = CognitoConfigurationReader.Read(configuration);

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MetadataAddress = $"{cognito.Issuer}/.well-known/jwks.json";
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = cognito.Issuer,
                    // Cognitoのアクセストークンにはaudクレームがなくclient_idでApp Clientを判別する。
                    // 既定のaud検証は使わず、token_use / client_idは下のイベントで検証する
                    ValidateAudience = false,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero,
                    RequireSignedTokens = true,
                    RequireExpirationTime = true,
                };
                options.Events = new JwtBearerEvents
                {
                    OnTokenValidated = context =>
                    {
                        var claims = context.Principal?.Claims ?? Enumerable.Empty<Claim>();
                        var tokenUse = claims.FirstOrDefault(c => c.Type == "token_use")?.Value;
                        var clientId = claims.FirstOrDefault(c => c.Type == "client_id")?.Value;

                        if (tokenUse is null || clientId is null)
                        {
                            context.Fail("token_use / client_id クレームがありません。");
                            return Task.CompletedTask;
                        }
                        if (tokenUse != "access")
                        {
                            // IDトークンはAPI認証に使えない
                            context.Fail("アクセストークンではありません。");
                            return Task.CompletedTask;
                        }
                        if (clientId != cognito.AppClientId)
                        {
                            context.Fail("このApp Client向けのトークンではありません。");
                            return Task.CompletedTask;
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        return services;
    }
}
