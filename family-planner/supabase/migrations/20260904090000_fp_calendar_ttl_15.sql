-- The wall iPad pulls the calendars every 15 minutes, so a 30 minute cache
-- would answer every second run from the cache and the plan would lag.
--
-- Caching itself stays: the TTL is per calendar, not per viewer, so several
-- screens still cost one fetch. Only calendars still on the old default are
-- moved; one set by hand keeps its value.

alter table public.fp_calendars alter column ttl_minutes set default 15;
update public.fp_calendars set ttl_minutes = 15 where ttl_minutes = 30;
