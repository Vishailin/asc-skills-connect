INSERT INTO users (id, role, email, mobile, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000010', 'employer', 'hr@gautengfreight.co.za', '0839999001', 'x'),
  ('00000000-0000-0000-0000-000000000011', 'employer', 'hr@wctech.co.za',         '0839999002', 'x');

INSERT INTO employer_profiles (id, user_id, company_name, province, subscription_tier) VALUES
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Gauteng Freight Employer', 'Gauteng', 'Standard'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011', 'Western Cape Tech Employer', 'Western Cape', 'Premium');

INSERT INTO opportunities
  (id, employer_id, title, opportunity_type, funding_source, req_province, req_age_min, req_age_max, req_employment_status, req_qualification_min)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   'Supply Chain Learnership', 'Learnership', 'SETA-funded', 'Gauteng', 18, 35, 'Unemployed', 'Matric'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   'ICT Support Internship', 'Internship', 'Employer-funded', 'Western Cape', 18, 30, 'Unemployed', 'Diploma');
