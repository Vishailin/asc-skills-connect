-- Seed data — mirrors the sample candidates used in the matching-engine
-- and employer-view prototypes, so all three pieces stay consistent.

INSERT INTO users (id, role, email, mobile, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'learner', 'nomvula.k@example.co.za', '0821234561', 'x'),
  ('00000000-0000-0000-0000-000000000002', 'learner', 'sipho.m@example.co.za',   '0821234562', 'x'),
  ('00000000-0000-0000-0000-000000000003', 'learner', 'lerato.d@example.co.za',  '0821234563', 'x'),
  ('00000000-0000-0000-0000-000000000004', 'learner', 'johan.p@example.co.za',   '0821234564', 'x'),
  ('00000000-0000-0000-0000-000000000005', 'learner', 'thandiwe.n@example.co.za','0821234565', 'x');

INSERT INTO learner_profiles
  (id, user_id, full_name, surname, id_number, date_of_birth, gender, province, municipality,
   employment_status, work_experience, highest_qualification, availability_status)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Nomvula', 'Khumalo', '9801015800081', '1998-01-01', 'Female', 'Gauteng', 'City of Johannesburg', 'Unemployed', '1-2 Years', 'Matric', 'Available'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Sipho', 'Mahlangu', '9503125800082', '1995-03-12', 'Male', 'Gauteng', 'Ekurhuleni', 'Unemployed', '3-5 Years', 'Certificate', 'Available'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'Lerato', 'Dlamini', '9906205800083', '1999-06-20', 'Female', 'Western Cape', 'City of Cape Town', 'Unemployed', '1-2 Years', 'Diploma', 'Available'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000004', 'Johan', 'Pretorius', '9209085800084', '1992-09-08', 'Male', 'Western Cape', 'City of Cape Town', 'Employed', '5+ Years', 'Degree', 'Employed'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005', 'Thandiwe', 'Nkosi', '0401105800085', '2004-01-10', 'Female', 'Gauteng', 'Tshwane', 'Unemployed', 'No Experience', 'Grade 11', 'Available');

INSERT INTO learner_visibility_settings (learner_id, visible_to_employers, visible_to_tsps, visible_to_funders) VALUES
  ('10000000-0000-0000-0000-000000000001', TRUE, TRUE, FALSE),
  ('10000000-0000-0000-0000-000000000002', TRUE, TRUE, FALSE),
  ('10000000-0000-0000-0000-000000000003', TRUE, TRUE, FALSE),
  ('10000000-0000-0000-0000-000000000004', TRUE, FALSE, FALSE),
  ('10000000-0000-0000-0000-000000000005', TRUE, TRUE, FALSE);

INSERT INTO learner_career_interests (learner_id, field_id)
SELECT '10000000-0000-0000-0000-000000000001', id FROM career_fields WHERE name IN ('Supply Chain', 'Administration');
INSERT INTO learner_career_interests (learner_id, field_id)
SELECT '10000000-0000-0000-0000-000000000002', id FROM career_fields WHERE name IN ('Supply Chain');
INSERT INTO learner_career_interests (learner_id, field_id)
SELECT '10000000-0000-0000-0000-000000000003', id FROM career_fields WHERE name IN ('ICT');
INSERT INTO learner_career_interests (learner_id, field_id)
SELECT '10000000-0000-0000-0000-000000000004', id FROM career_fields WHERE name IN ('ICT', 'Finance');
INSERT INTO learner_career_interests (learner_id, field_id)
SELECT '10000000-0000-0000-0000-000000000005', id FROM career_fields WHERE name IN ('Retail');

-- Verification: mirrors the idVerified/qualVerified flags from the prototypes
INSERT INTO verification_records (learner_id, record_type, status, provider) VALUES
  ('10000000-0000-0000-0000-000000000001', 'id', 'verified', 'Accredited DHA vendor (demo)'),
  ('10000000-0000-0000-0000-000000000001', 'qualification', 'verified', 'SAQA VeriSearch (demo)'),
  ('10000000-0000-0000-0000-000000000002', 'id', 'verified', 'Accredited DHA vendor (demo)'),
  ('10000000-0000-0000-0000-000000000002', 'qualification', 'pending', NULL),
  ('10000000-0000-0000-0000-000000000003', 'id', 'verified', 'Accredited DHA vendor (demo)'),
  ('10000000-0000-0000-0000-000000000003', 'qualification', 'verified', 'SAQA VeriSearch (demo)'),
  ('10000000-0000-0000-0000-000000000004', 'id', 'verified', 'Accredited DHA vendor (demo)'),
  ('10000000-0000-0000-0000-000000000004', 'qualification', 'verified', 'SAQA VeriSearch (demo)'),
  ('10000000-0000-0000-0000-000000000005', 'id', 'pending', NULL),
  ('10000000-0000-0000-0000-000000000005', 'qualification', 'pending', NULL);

-- One example of the funded-programme-history section in action
INSERT INTO learner_funded_programme_history (learner_id, programme_name, funder_id, programme_year, outcome, led_to_employment)
SELECT '10000000-0000-0000-0000-000000000002', 'Warehouse Operations Learnership',
       (SELECT id FROM funders WHERE name = 'merSETA'), 2021, 'Completed', FALSE;
