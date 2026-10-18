using Kakeibo.Api.Authentication;
using Kakeibo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Xunit;

namespace Kakeibo.Api.Tests.Authentication;

/// <summary>Cognito discovery文書からjwks_uriをたどって署名鍵を得る構成をAWS接続なしで検証する。</summary>
public class CognitoMetadataTests
{
    private const string Issuer = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_testpool";
    private const string MetadataAddress = Issuer + "/.well-known/openid-configuration";
    private const string JwksAddress = Issuer + "/.well-known/jwks.json";

    [Fact]
    public async Task JwtBearer_uses_discovery_document_and_retrieves_its_jwks()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cognito:Region"] = "us-east-1",
            ["Cognito:UserPoolId"] = "us-east-1_testpool",
            ["Cognito:AppClientId"] = "client123",
        }).Build();
        services.AddCognitoAuthentication(configuration);
        using var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);

        Assert.Equal(MetadataAddress, options.MetadataAddress);

        var retriever = new StubDocumentRetriever(new Dictionary<string, string>
        {
            [MetadataAddress] = $$"""{"issuer":"{{Issuer}}","jwks_uri":"{{JwksAddress}}"}""",
            [JwksAddress] = TestSigningKeysJwks(),
        });
        var openIdConfiguration = await OpenIdConnectConfigurationRetriever.GetAsync(
            options.MetadataAddress, retriever, CancellationToken.None);

        Assert.Equal(new[] { MetadataAddress, JwksAddress }, retriever.RequestedAddresses);
        Assert.Single(openIdConfiguration.SigningKeys);
    }

    private static string TestSigningKeysJwks()
    {
        var jwk = Microsoft.IdentityModel.Tokens.JsonWebKeyConverter.ConvertFromRSASecurityKey(
            new Microsoft.IdentityModel.Tokens.RsaSecurityKey(TestSigningKeys.Instance.Rsa.ExportParameters(false))
            {
                KeyId = TestSigningKeys.Instance.Kid,
            });
        var encoded = System.Text.Json.JsonSerializer.Serialize(new
        {
            keys = new[]
            {
                new
                {
                    kty = jwk.Kty,
                    use = "sig",
                    kid = jwk.Kid,
                    alg = "RS256",
                    n = jwk.N,
                    e = jwk.E,
                },
            },
        });
        return encoded;
    }

    private sealed class StubDocumentRetriever(IReadOnlyDictionary<string, string> documents) : IDocumentRetriever
    {
        public List<string> RequestedAddresses { get; } = [];

        public Task<string> GetDocumentAsync(string address, CancellationToken cancel)
        {
            RequestedAddresses.Add(address);
            if (!documents.TryGetValue(address, out var document))
            {
                throw new InvalidOperationException($"Unexpected metadata request: {address}");
            }
            return Task.FromResult(document);
        }
    }
}
