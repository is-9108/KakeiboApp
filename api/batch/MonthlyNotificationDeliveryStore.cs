using Kakeibo.Api.Data;
using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.MonthlyBatch;

public interface IMonthlyNotificationDeliveryStore
{
    Task<MonthlyNotificationDelivery?> FindAsync(DateOnly targetMonth, CancellationToken cancellationToken);
    Task<bool> TryClaimAsync(DateOnly targetMonth, CancellationToken cancellationToken);
    Task MarkAcceptedAsync(DateOnly targetMonth, CancellationToken cancellationToken);
}

public sealed class MonthlyNotificationDeliveryStore(KakeiboDbContext db, TimeProvider timeProvider) : IMonthlyNotificationDeliveryStore
{
    public Task<MonthlyNotificationDelivery?> FindAsync(DateOnly targetMonth, CancellationToken cancellationToken)
        => db.MonthlyNotificationDeliveries.AsNoTracking().SingleOrDefaultAsync(d => d.TargetMonth == targetMonth, cancellationToken);

    public async Task<bool> TryClaimAsync(DateOnly targetMonth, CancellationToken cancellationToken)
    {
        // バッチはトランザクションを開始しない。単一文の暗黙コミット完了後にだけ送信へ進む。
        var affected = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO monthly_notification_deliveries (target_month, claimed_at)
            VALUES ({targetMonth}, {timeProvider.GetUtcNow()})
            ON CONFLICT (target_month) DO NOTHING
            """, cancellationToken);
        return affected == 1;
    }

    public async Task MarkAcceptedAsync(DateOnly targetMonth, CancellationToken cancellationToken)
    {
        var acceptedAt = timeProvider.GetUtcNow();
        var affected = await db.MonthlyNotificationDeliveries
            .Where(d => d.TargetMonth == targetMonth && d.AcceptedAt == null)
            .ExecuteUpdateAsync(setters => setters.SetProperty(d => d.AcceptedAt, acceptedAt), cancellationToken);
        if (affected != 1)
        {
            throw new InvalidOperationException("月次通知の受理記録を更新できませんでした。");
        }
    }
}
