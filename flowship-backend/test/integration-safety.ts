const expectedUrl =
    'postgresql://flowship_test:local_test_password@127.0.0.1:5433/flowship_test';

if (
    process.env.FLOWSHIP_LOCAL_DB_TEST !== 'true' ||
    process.env.DATABASE_URL !== expectedUrl
) {
    throw new Error(
        'SAFETY BLOCK: Integration tests require the isolated local PostgreSQL database. Set FLOWSHIP_LOCAL_DB_TEST=true and DATABASE_URL to the local test database.',
    );
}
