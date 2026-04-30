namespace Kakeibo.DTO
{
    public record RequestCreateTransaction(
        int Amount,
        int Category,
        string Memo
    );

}
