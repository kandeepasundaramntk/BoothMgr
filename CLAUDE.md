# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Greenfield project — **no code exists yet**. The directory is not a git repository. The only artifact is the requirements document `By election booth level detailed requirement.xlsx`. Any build/test/lint commands will be defined once a tech stack is chosen; update this file at that point.

## What This Project Is

"BoothMgr" is a booth-level election campaign management system for the 2026 Tamil Nadu by-elections (NTK 2.0). Requirements are bilingual — feature descriptions in the spreadsheet are written in Tamil with English parenthetical labels. UI and data will likely need Tamil-language support.

## Requirements Document

`By election booth level detailed requirement.xlsx` has two sheets:

1. **"Booth level details"** — the core data schema, one row per booth. Columns: Sl. No., Assembly Name, Booth Number, Village/Ward/Area, 2026 polled votes (party-wise), % of caste, % of religion, micro-influencer name & contact details, macro socioeconomic trends, alliance dynamics & vote splitters, candidate selection, media narrative, anti-incumbency, beneficiary mapping.

2. **"Booth level actions"** — ~20 booth-level campaign features described in Tamil, keyed by Assembly + Booth Number. Major ones: voter turnout tracking, micro-demographics (caste/minority vote counts), micro-influencer alignment, beneficiary mapping and follow-up (government scheme recipients), page committee network (one agent per voter-roll page, 1:1 family-level auditing), Booth Health Score (committed/swing/opponent voter percentages), displacement velocity (vote-shift tracking), WhatsApp cluster management (30–40 families per group, hyper-local messaging), youth/first-time voter conversion (ages 18–22), digital war room with AI-driven command dashboards, vote-splitter factor prediction, real-time LLM sentiment monitoring with counter-narrative response, regional influencer matrices, Candidate Viability Index, and anti-incumbency vulnerability mapping.

## Reading the Spreadsheet

Python with `openpyxl` is available (`python` on PATH). The console codepage is cp1252, so printing Tamil text directly raises `UnicodeEncodeError` — write extracted content to a UTF-8 file and Read that file instead:

```python
import openpyxl, io
wb = openpyxl.load_workbook(r'By election booth level detailed requirement.xlsx', data_only=True)
out = io.open('dump.txt', 'w', encoding='utf-8')  # never print() Tamil to console
```

## Data Sensitivity

The system is designed to hold voter-level political data: caste/religion percentages, individual influencer contact details, family-level political leanings, and beneficiary lists. Treat any real data files as sensitive — do not commit them, and flag privacy implications when designing storage or export features.
