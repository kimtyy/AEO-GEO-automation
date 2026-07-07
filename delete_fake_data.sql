-- delete_fake_data.sql
-- DB 가짜 데이터 정리: analysis_results 테이블에서 created_at < '2026-06-30 03:39:00+09' 인 행 삭제
DELETE FROM analysis_results
WHERE created_at < '2026-06-30 03:39:00+09';
