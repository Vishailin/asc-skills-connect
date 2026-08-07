-- Replaces the placeholder 'x' password_hash values left by the earlier
-- seed files with real bcrypt hashes, so /api/auth/login has something
-- genuine to check against. Uses pgcrypto's crypt()+gen_salt('bf') —
-- already available via the pgcrypto extension schema.sql creates —
-- which produces standard $2a$ bcrypt hashes, directly compatible with
-- bcryptjs.compare() in server.js. No separate hashing script needed.
--
-- Demo password for every seeded account: Passw0rd!

UPDATE users SET password_hash = crypt('Passw0rd!', gen_salt('bf'));

INSERT INTO users (id, role, email, mobile, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000099', 'admin', 'admin@ascskillsconnect.co.za', '0839999099',
   crypt('Passw0rd!', gen_salt('bf')));
