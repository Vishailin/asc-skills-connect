INSERT INTO users (id, role, email, mobile, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000020', 'tsp', 'admin@ubuntuskills.co.za', '0839999010', 'x');

INSERT INTO tsp_profiles (id, user_id, organisation_name, accreditation_number, accrediting_seta_id, province) VALUES
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000020',
   'Ubuntu Skills Academy', 'ACC-2024-0417',
   (SELECT id FROM funders WHERE name = 'merSETA'), 'Gauteng');

INSERT INTO opportunities
  (id, tsp_id, title, opportunity_type, funding_source, req_province, req_age_min, req_age_max, req_employment_status, req_qualification_min)
VALUES
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001',
   'Warehouse Operations Skills Programme', 'Skills Programme', 'SETA-funded',
   'Gauteng', 18, 30, 'Unemployed', 'Grade 11');

-- Put a couple of existing learners further along the TSP pipeline so the
-- dashboard has something beyond "matched" to show.
INSERT INTO applications (learner_id, opportunity_id, eligibility_score, status) VALUES
  ('10000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000003', 75, 'enrolled'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 100, 'shortlisted');
