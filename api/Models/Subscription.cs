namespace Kakeibo.Api.Models;

/// <summary>月額サブスク。収支への自動登録は別機能で行う。</summary>
public class Subscription
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int Amount { get; set; }
    public required string Memo { get; set; }
}
