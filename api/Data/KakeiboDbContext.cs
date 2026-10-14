using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Data;

/// <summary>家計簿アプリのDbContext。</summary>
public class KakeiboDbContext(DbContextOptions<KakeiboDbContext> options) : DbContext(options)
{
    /// <summary>収支。</summary>
    public DbSet<Entry> Entries => Set<Entry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Entry>(entity =>
        {
            entity.ToTable("entries");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id)
                .HasColumnName("id")
                .ValueGeneratedOnAdd();
            entity.Property(e => e.Date)
                .HasColumnName("date")
                .HasColumnType("date");
            entity.Property(e => e.Type)
                .HasColumnName("type")
                .HasMaxLength(10);
            entity.Property(e => e.Amount)
                .HasColumnName("amount");
            entity.Property(e => e.Category)
                .HasColumnName("category")
                .HasMaxLength(20);
            entity.Property(e => e.Memo)
                .HasColumnName("memo")
                .HasMaxLength(500);
        });
    }
}
