-- "Long Pending Issues" free-text section from the Assembly POC paper form.
alter table booths add column long_pending_issues text not null default '';
