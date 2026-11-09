namespace Kakeibo.Api.Models;

/// <summary>月初のサブスク登録台帳。収支やサブスクの削除後も保持する。</summary>
public class SubscriptionRegistration
{
    public int Id { get; set; }
    public int SubscriptionId { get; set; }
    public DateOnly TargetMonth { get; set; }
    public int EntryId { get; set; }
}
