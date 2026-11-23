using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kakeibo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMonthlyNotificationDeliveries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "monthly_notification_deliveries",
                columns: table => new
                {
                    target_month = table.Column<DateOnly>(type: "date", nullable: false),
                    claimed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    accepted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_monthly_notification_deliveries", x => x.target_month);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "monthly_notification_deliveries");
        }
    }
}
