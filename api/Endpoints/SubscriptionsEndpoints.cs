using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Endpoints;

/// <summary>サブスクの登録・編集入力。</summary>
public sealed record SubscriptionRequest(string? Name, int? Amount, string? Memo);

/// <summary>サブスクの保存値。</summary>
public sealed record SubscriptionResponse(int Id, string Name, int Amount, string Memo)
{
    public static SubscriptionResponse From(Subscription subscription) =>
        new(subscription.Id, subscription.Name, subscription.Amount, subscription.Memo);
}

/// <summary>サブスクの登録・一覧・編集・削除。</summary>
public static class SubscriptionsEndpoints
{
    public static void MapSubscriptionsEndpoints(this IEndpointRouteBuilder app)
    {
        var subscriptions = app.MapGroup("/api/subscriptions");

        subscriptions.MapGet("/", async (KakeiboDbContext db) =>
        {
            var list = await db.Subscriptions.OrderBy(s => s.Id).ToListAsync();
            return Results.Ok(list.Select(SubscriptionResponse.From));
        });

        subscriptions.MapPost("/", async (SubscriptionRequest request, KakeiboDbContext db) =>
        {
            var errors = Validate(request);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var subscription = new Subscription
            {
                Name = request.Name!,
                Amount = request.Amount!.Value,
                Memo = request.Memo ?? "",
            };
            db.Subscriptions.Add(subscription);
            await db.SaveChangesAsync();
            return Results.Created($"/api/subscriptions/{subscription.Id}", SubscriptionResponse.From(subscription));
        });

        subscriptions.MapPut("/{id:int}", async (int id, SubscriptionRequest request, KakeiboDbContext db) =>
        {
            var errors = Validate(request);
            if (errors.Count > 0)
            {
                return Results.ValidationProblem(errors);
            }

            var subscription = await db.Subscriptions.FindAsync(id);
            if (subscription is null)
            {
                return Results.NotFound();
            }

            subscription.Name = request.Name!;
            subscription.Amount = request.Amount!.Value;
            subscription.Memo = request.Memo ?? "";
            await db.SaveChangesAsync();
            return Results.Ok(SubscriptionResponse.From(subscription));
        });

        subscriptions.MapDelete("/{id:int}", async (int id, KakeiboDbContext db) =>
        {
            var subscription = await db.Subscriptions.FindAsync(id);
            if (subscription is null)
            {
                return Results.NotFound();
            }

            db.Subscriptions.Remove(subscription);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static Dictionary<string, string[]> Validate(SubscriptionRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 100)
        {
            errors["name"] = ["名前は1〜100文字で指定してください。"];
        }
        if (request.Amount is null or < 1)
        {
            errors["amount"] = ["金額は1以上の整数を指定してください。"];
        }
        if (request.Memo?.Length > 500)
        {
            errors["memo"] = ["メモは500文字以内で指定してください。"];
        }
        return errors;
    }
}
