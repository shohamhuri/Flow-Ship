const allowedUrls = [
    'postgresql://flowship_test:local_test_password@127.0.0.1:5433/flowship_test',
    'postgresql://flowship_test:local_test_password@127.0.0.1:5433/flowship_ci_verify',
    'postgresql://flowship_test:local_test_password@127.0.0.1:5433/flowship_ci_fresh',
    'postgresql://flowship_test:local_test_password@127.0.0.1:5433/flowship_ci_final',
];

if (
    process.env.FLOWSHIP_LOCAL_DB_TEST !== 'true' ||
    !allowedUrls.includes(process.env.DATABASE_URL ?? '')
) {
    throw new Error(
        'SAFETY BLOCK: Integration tests require an isolated local PostgreSQL test database.',
    );
}