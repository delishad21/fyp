# Teacher Account Management Scripts

This directory contains scripts for managing teacher accounts in bulk.

## Files

- **`seed-teachers.ts`** - Creates teacher accounts and saves credentials to CSV
- **`teacher-credentials.csv`** - CSV file containing all teacher usernames, emails, and passwords
- **`patch-all-failed-teachers.ts`** - Updates passwords for teachers from the CSV file
- **`test-teacher-passwords.ts`** - Tests if passwords work correctly

## Usage

### 1. Seed Teachers

Creates 50 teacher accounts and saves their credentials to `teacher-credentials.csv`:

```bash
npx ts-node scripts/seed-teachers.ts
```

The script will output the credentials and save them to the CSV file automatically.

### 2. Test Passwords

Test all passwords from the CSV file:

```bash
npx ts-node scripts/test-teacher-passwords.ts
```

Test passwords starting from a specific teacher (e.g., teacher013):

```bash
npx ts-node scripts/test-teacher-passwords.ts teacher013
```

### 3. Patch Failed Accounts

Patch all accounts from the CSV file:

```bash
npx ts-node scripts/patch-all-failed-teachers.ts
```

Patch specific teachers only:

```bash
npx ts-node scripts/patch-all-failed-teachers.ts teacher009 teacher012 teacher022
```

## CSV Format

The `teacher-credentials.csv` file should have the following format:

```csv
username,email,password
teacher001,teacher001@example.test,jy2!t^x6xE
teacher002,teacher002@example.test,wb5^HSjEA9
...
```

## Environment Variables

Make sure `USER_MONGODB_URI` is set correctly in your `.env` file or pass it as an environment variable:

```bash
USER_MONGODB_URI="mongodb://root:password@localhost:27018/user?authSource=admin&replicaSet=rs0&directConnection=true" npx ts-node scripts/test-teacher-passwords.ts
```

## Notes

- The seed script will skip accounts that already exist
- The patch script re-hashes passwords with bcrypt
- The test script compares plain-text passwords against hashed passwords in the database
