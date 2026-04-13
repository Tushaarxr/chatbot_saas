import asyncio
from sqlalchemy import text
from db.postgres import engine, Base

async def debug_db():
    print("--- Inspecting 'users' table columns ---")
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_name = 'users'"
        ))
        columns = result.fetchall()
        for col in columns:
            print(f"- {col.column_name}: {col.data_type}")
        
        column_names = [col.column_name for col in columns]
        missing = [c for c in ["display_name", "password_hash"] if c not in column_names]
        
        if missing:
            print(f"\n[WARNING] Missing columns: {missing}")
            print("Dropping and recreating all tables to sync schema...")
            # In a real app we'd use Alembic, but for this dev setup we'll just recreate
            async with engine.begin() as conn_init:
                await conn_init.run_sync(Base.metadata.drop_all)
                await conn_init.run_sync(Base.metadata.create_all)
            print("[OK] All tables recreated.")
        else:
            print("\n[OK] Schema is up to date.")

if __name__ == "__main__":
    asyncio.run(debug_db())
