#!/bin/sh
# Builds pro11-database-update.sql: the re-run preamble, then steps 8 to 19, in order.
cd "$(dirname "$0")/.." || exit 1
M=supabase/migrations
{
  echo "-- Pro11 · Database update (cumulative): steps 5-7, upcoming matches, squad timing, audit fixes, match report,"
  echo "-- Cricbuzz (continuous), ledger, wallet removed, Cricbuzz only."
  echo "-- Run once in Supabase → SQL Editor. Safe to re-run, whatever you ran before."
  echo
  cat supabase/rerun_prelude.sql; echo
  for f in 08_fantasy 09_ranks 10_complete 11_upcoming 12_squad_timing 13_polish 14_match_report 15_cricbuzz 16_cricbuzz_live 17_ledger 18_no_wallet 19_cricbuzz_only 20_live_updates; do
    cat "$M/202611140000$f.sql"; echo
  done
} > "${1:-pro11-database-update.sql}"
