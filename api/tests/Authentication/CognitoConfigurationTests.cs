using Kakeibo.Api.Authentication;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Kakeibo.Api.Tests.Authentication;

public class CognitoConfigurationTests
{
    [Fact]
    public void Read_accepts_well_formed_cognito_configuration()
    {
        var configuration = Configuration("us-east-1", "us-east-1_AbCd1234", "client123");

        var result = CognitoConfigurationReader.Read(configuration);

        Assert.Equal("https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCd1234", result.Issuer);
    }

    [Theory]
    [InlineData(null, "us-east-1_AbCd1234", "client123")]
    [InlineData("not-a-region", "not-a-region_pool", "client123")]
    [InlineData("us-east-1", "eu-west-1_AbCd1234", "client123")]
    [InlineData("us-east-1", "us-east-1_AbCd1234", null)]
    [InlineData("us-east-1", "us-east-1_AbCd1234", "client-with-hyphen")]
    public void Read_rejects_missing_or_malformed_values(string? region, string? userPoolId, string? appClientId)
    {
        var configuration = Configuration(region, userPoolId, appClientId);

        Assert.Throws<InvalidOperationException>(() => CognitoConfigurationReader.Read(configuration));
    }

    private static IConfiguration Configuration(string? region, string? userPoolId, string? appClientId) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Cognito:Region"] = region,
            ["Cognito:UserPoolId"] = userPoolId,
            ["Cognito:AppClientId"] = appClientId,
        }).Build();
}
