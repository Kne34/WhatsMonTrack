UPDATE "User" SET email = gen_random_uuid()::text || '@example.com';
