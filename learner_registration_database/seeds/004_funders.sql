INSERT INTO users (id, role, email, mobile, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000030', 'funder', 'admin@mictseta.org.za', '0839999030', 'x');

INSERT INTO funder_profiles (id, user_id, organisation_name, funder_type, funder_ref_id) VALUES
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000030',
   'MICT SETA', 'SETA', (SELECT id FROM funders WHERE name = 'MICT SETA'));

INSERT INTO opportunities
  (id, funder_id, title, opportunity_type, funding_source, req_province, req_age_min, req_age_max, req_employment_status, req_qualification_min)
VALUES
  ('30000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001',
   'ICT Support Learnership', 'Learnership', 'MICT SETA-funded',
   'Gauteng', 18, 35, 'Unemployed', 'Matric');

-- Give the funded programme some pipeline activity so the dashboard has
-- non-zero stats to show, spanning a few different statuses.
INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status) VALUES
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 100, 'shortlisted'),
  ('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', 100, 'placed');
