using Kakeibo.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Kakeibo.Api.Data;

/// <summary>家計簿アプリのDbContext。</summary>
public class KakeiboDbContext(DbContextOptions<KakeiboDbContext> options) : DbContext(options)
{
    /// <summary>収支。</summary>
    public DbSet<Entry> Entries => Set<Entry>();

    /// <summary>月額サブスク。</summary>
    public DbSet<Subscription> Subscriptions => Set<Subscription>();

    /// <summary>月初のサブスク登録台帳。</summary>
    public DbSet<SubscriptionRegistration> SubscriptionRegistrations => Set<SubscriptionRegistration>();

    /// <summary>レシート解析ジョブ。</summary>
    public DbSet<ReceiptAnalysisJob> ReceiptAnalysisJobs => Set<ReceiptAnalysisJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ReceiptAnalysisJob>(entity =>
        {
            entity.ToTable("receipt_analysis_jobs");
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasColumnName("id");
            entity.Property(r => r.ObjectKey).HasColumnName("object_key").HasMaxLength(100);
            entity.Property(r => r.Status).HasColumnName("status").HasMaxLength(10);
            entity.Property(r => r.ReceiptDate).HasColumnName("receipt_date").HasColumnType("date");
            entity.Property(r => r.TotalAmount).HasColumnName("total_amount");
            entity.Property(r => r.StoreName).HasColumnName("store_name").HasMaxLength(100);
            entity.Property(r => r.Category).HasColumnName("category").HasMaxLength(20);
            entity.Property(r => r.CreatedAt).HasColumnName("created_at");
            entity.Property(r => r.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(r => r.ObjectKey).IsUnique();
        });

        modelBuilder.Entity<SubscriptionRegistration>(entity =>
        {
            entity.ToTable("subscription_registrations");
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Id).HasColumnName("id").ValueGeneratedOnAdd();
            entity.Property(r => r.SubscriptionId).HasColumnName("subscription_id");
            entity.Property(r => r.TargetMonth).HasColumnName("target_month").HasColumnType("date");
            entity.Property(r => r.EntryId).HasColumnName("entry_id");
            entity.HasIndex(r => new { r.SubscriptionId, r.TargetMonth }).IsUnique();
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.ToTable("subscriptions");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Id).HasColumnName("id").ValueGeneratedOnAdd();
            entity.Property(s => s.Name).HasColumnName("name").HasMaxLength(100);
            entity.Property(s => s.Amount).HasColumnName("amount");
            entity.Property(s => s.Memo).HasColumnName("memo").HasMaxLength(500);
        });

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
