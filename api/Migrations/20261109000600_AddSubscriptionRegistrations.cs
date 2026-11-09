using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Kakeibo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionRegistrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "subscription_registrations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    subscription_id = table.Column<int>(type: "integer", nullable: false),
                    target_month = table.Column<DateOnly>(type: "date", nullable: false),
                    entry_id = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscription_registrations", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_subscription_registrations_subscription_id_target_month",
                table: "subscription_registrations",
                columns: new[] { "subscription_id", "target_month" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "subscription_registrations");
        }
    }
}
