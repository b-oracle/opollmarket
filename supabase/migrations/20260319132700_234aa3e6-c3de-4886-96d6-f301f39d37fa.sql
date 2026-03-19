
-- Add 'scheduled' to space_status enum
ALTER TYPE space_status ADD VALUE IF NOT EXISTS 'scheduled' BEFORE 'live';
