"""
Fix PostgreSQL public schema permissions.

In PostgreSQL 15+, the CREATE privilege on the public schema is revoked by
default. This script connects as the postgres superuser and grants the
necessary privileges to the chatbot application user.

Run: python fix_db_permissions.py
"""

import asyncio
import getpass
import sys

import asyncpg


async def fix_permissions(pg_password: str) -> None:
    """Connect as postgres superuser and grant schema privileges to chatbot user."""
    # Read target DB info from config
    app_user = "chatbot"
    db_name = "chatbot_platform"
    host = "localhost"
    port = 5432

    print(f"\nConnecting to PostgreSQL as superuser (postgres) ...")
    try:
        conn = await asyncpg.connect(
            host=host,
            port=port,
            user="postgres",
            password=pg_password,
            database=db_name,
        )
    except Exception as e:
        print(f"\n[FAIL] Could not connect as postgres: {e}")
        sys.exit(1)

    try:
        print(f"Granting schema privileges to '{app_user}' on database '{db_name}' ...")

        await conn.execute(f"GRANT ALL ON SCHEMA public TO {app_user};")
        print(f"  [OK] GRANT ALL ON SCHEMA public TO {app_user}")

        await conn.execute(
            f"GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {app_user};"
        )
        print(f"  [OK] GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {app_user}")

        await conn.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {app_user};"
        )
        print(f"  [OK] ALTER DEFAULT PRIVILEGES...")

        # Also grant sequence privileges for auto-increment / serial columns
        await conn.execute(
            f"GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {app_user};"
        )
        print(f"  [OK] GRANT ALL PRIVILEGES ON ALL SEQUENCES...")

        await conn.execute(
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {app_user};"
        )
        print(f"  [OK] ALTER DEFAULT PRIVILEGES (sequences)...")

        print("\n[SUCCESS] All privileges granted. You can now start uvicorn.")

    except Exception as e:
        print(f"\n[FAIL] Error granting privileges: {e}")
        sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    print("=== PostgreSQL Permission Fix (PostgreSQL 15+ compatibility) ===")
    print("This script grants CREATE/INSERT/UPDATE/DELETE on schema 'public'")
    print("to the 'chatbot' application user.\n")

    pg_pass = getpass.getpass("Enter password for postgres superuser: ")
    asyncio.run(fix_permissions(pg_pass))
