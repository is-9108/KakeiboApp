using KakeiboApp.Models;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using System;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

builder.Services.AddDbContext<KakeiboContext>(options =>
    options.UseSqlite("Data Source=kakeibo.db"));

var app = builder.Build();

// appsettings.jsonÇ©ÇÁForwardedHeadersÇì«Ç›çûÇﬁ
var forwardedHeadersConfig = builder.Configuration.GetSection("ForwardedHeaders");
var headers = ForwardedHeaders.None;

if (forwardedHeadersConfig.Exists())
{
    var headersString = forwardedHeadersConfig["ForwardedHeaders"];
    if (!string.IsNullOrEmpty(headersString))
    {
        foreach (var header in headersString.Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            if (Enum.TryParse<ForwardedHeaders>(header.Trim(), true, out var parsed))
            {
                headers |= parsed;
            }
        }
    }
}

if (headers != ForwardedHeaders.None)
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = headers
    });
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Kakeibo}/{action=Index}");

app.Run();
