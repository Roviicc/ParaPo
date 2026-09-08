-- Supabase security advisor: functions should pin search_path so a caller
-- cannot swap in a malicious schema. touch_updated_at only touches NEW, so
-- an empty search_path is correct and sufficient.

alter function public.touch_updated_at() set search_path = '';
