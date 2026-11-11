using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kakeibo.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddReceiptAnalysisJobs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "receipt_analysis_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    object_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    receipt_date = table.Column<DateOnly>(type: "date", nullable: true),
                    total_amount = table.Column<int>(type: "integer", nullable: true),
                    store_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_analysis_jobs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_receipt_analysis_jobs_object_key",
                table: "receipt_analysis_jobs",
                column: "object_key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_analysis_jobs");
        }
    }
}
