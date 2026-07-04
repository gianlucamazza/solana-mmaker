import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'node_modules/**'] },
    ...tseslint.configs.recommended,
    {
        rules: {
            // The market-making loop is intentionally a `while (true)`.
            'no-constant-condition': ['error', { checkLoops: false }],
        },
    },
);
