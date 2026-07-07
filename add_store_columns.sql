-- add_store_columns.sql
-- stores 테이블에 AEO 마케팅 정보 관련 14개 컬럼 및 소개글 원본 컬럼 추가

ALTER TABLE stores ADD COLUMN IF NOT EXISTS introduction TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS price_range TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS parking TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS capacity TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS private_room TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS story TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS target_customers TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS local_context TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS events TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS naver_place_url TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS naver_place_current TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS naver_place_optimized TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_biz_url TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_biz_current TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS google_biz_optimized TEXT;
