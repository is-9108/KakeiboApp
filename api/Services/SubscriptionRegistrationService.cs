using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Services;

/// <summary>月初のサブスク登録件数と登録済みによるスキップ件数。</summary>
public sealed record SubscriptionRegistrationResult(int RegisteredCount, int SkippedCount);

/// <summary>サブスクの支出と登録台帳を同一トランザクションで作成する。</summary>
public sealed class SubscriptionRegistrationService(KakeiboDbContext db)
{
    public async Task<SubscriptionRegistrationResult> RegisterAsync(DateOnly targetMonth, CancellationToken cancellationToken = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // 同時実行でもキーを同じ順に確保し、互いの台帳挿入を待つデッドロックを避ける。
        var subscriptions = await db.Subscriptions.AsNoTracking().OrderBy(s => s.Id).ToListAsync(cancellationToken);
        var registeredCount = 0;
        var skippedCount = 0;
        foreach (var subscription in subscriptions)
        {
            // EntryIdは収支保存後に更新する。仮値がコミットされる経路は作らない。
            var inserted = await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO subscription_registrations (subscription_id, target_month, entry_id)
                VALUES ({subscription.Id}, {targetMonth}, 0)
                ON CONFLICT (subscription_id, target_month) DO NOTHING
                """, cancellationToken);
            if (inserted == 0)
            {
                skippedCount++;
                continue;
            }

            var entry = new Entry
            {
                Date = targetMonth,
                Type = Presets.Expense,
                Category = "サブスク",
                Amount = subscription.Amount,
                Memo = subscription.Name,
            };
            db.Entries.Add(entry);
            await db.SaveChangesAsync(cancellationToken);
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE subscription_registrations SET entry_id = {entry.Id}
                WHERE subscription_id = {subscription.Id} AND target_month = {targetMonth}
                """, cancellationToken);
            registeredCount++;
        }

        await transaction.CommitAsync(cancellationToken);
        return new SubscriptionRegistrationResult(registeredCount, skippedCount);
    }
}
