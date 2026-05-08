from database import get_db_path, initialize_database


def main() -> None:
    initialize_database()
    print(f"SQLite database initialized at {get_db_path()}")


if __name__ == "__main__":
    main()
