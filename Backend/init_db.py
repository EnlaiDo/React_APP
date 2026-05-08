from database import DB_PATH, initialize_database


def main() -> None:
    initialize_database()
    print(f"SQLite database initialized at {DB_PATH}")


if __name__ == "__main__":
    main()
