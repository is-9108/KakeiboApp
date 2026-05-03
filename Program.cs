using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

builder.Services.AddScoped<Kakeibo.Services.Transaction.ITransaction, Kakeibo.Services.Transaction.Transaction>();
builder.Services.AddScoped<Kakeibo.Services.Category.ICategory, Kakeibo.Services.Category.Category>();
builder.Services.AddScoped<Kakeibo.Services.Monthly.IMonthly, Kakeibo.Services.Monthly.Monthly>();
builder.Services.AddScoped<Kakeibo.Services.Subscription.ISubscription, Kakeibo.Services.Subscription.Subscription>();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDbContext<Kakeibo.Data.AppDbContext>(options =>
{
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"));
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

using(var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<Kakeibo.Data.AppDbContext>();
    await Kakeibo.Data.DbInitializer.Initialize(context);
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
