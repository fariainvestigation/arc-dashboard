# ARC Notebook v4: Per-Report Style Layer

Supplement to the v3 prompt library. Version 4 adds a `STYLE FOR THIS REPORT`
instruction to every report type. The strict grounding wrapper, shared writing
standard, section toggles, four export formats, and deterministic blocks remain
unchanged.

The style layer controls how cited record material is written, never what may be
asserted. Exact record detail includes full names and roles, dates and clock
times, locations, quantities, serial numbers, form and report numbers, document
captions, and short exact quotes of pivotal language.

## Mandatory record-grounding standard

Every prompt and every report type must enforce these rules before any style instruction:

1. Use only facts, quotations, dates, names, locations, evidence, and authorities contained in the supplied case record.
2. Never invent a missing detail or convert an inference into a fact.
3. Distinguish verified facts, reported allegations, witness statements, investigator observations, analytical inferences, and legal opinions.
4. Attach a source excerpt tag or source locator to each material factual statement.
5. Preserve conflicts, uncertainty, and missing information. Use `NOT ESTABLISHED BY THE SUPPLIED RECORD` when the record does not support a requested detail.
6. Explain complex events in precise, plain language suitable for counsel, a court, and a non-technical reader.
7. Omit generic filler. Every sentence must communicate a supported case fact, a clearly labeled analysis, a material gap, or an actionable verification point.

## Assembly order

Built-in reports:

```text
WRITING STANDARD
+ report introduction
+ selected section list
+ report-type rules
+ STYLE FOR THIS REPORT
+ citation requirement
+ fallback instruction
+ attorney-review closing, where applicable
```

Custom reports receive the general ARC style before the user's additional
instructions. User instructions remain subordinate to the strict grounding
rules.

## Investigation Report

Open the Executive Overview with the two or three findings counsel most needs to
know, one sentence each, cited. Identify every person by full name and role on
first mention. Use exact dates, times, locations, quantities, serial numbers,
and document titles as the sources state them. Report specific cited detail
instead of a general summary. Use one subject per paragraph.

## Brief Document

Make the report readable in five minutes. Lead every section with its bottom
line. Use exact names, dates, charge language, and document titles. Never use a
general description where the record provides a specific one. Use one short
paragraph per point.

## Analysis

State every strength and weakness as a concrete cited fact. Name the witness,
exhibit, test, or record and state exactly what it shows. Each competing
explanation must name the specific cited items for and against it. Use one point
per paragraph, plain words, and no hedged abstractions.

## Procedure Road Map

Write each step so a reader who has never seen the file can follow who did what,
when, and on which form or record. Use exact clock times, form numbers, report
numbers, and equipment identifiers where stated. Name every actor with full
name, rank or title, and agency on first mention.

## Criminal Defense

Quote charge language, counts, and statute references exactly as they appear.
Map evidence to charges in plain sentences by naming the witness or exhibit and
stating exactly what it says. Keep pivotal exculpatory language in short exact
quotes with citations.

## Defense Strategy

Write each leverage point as one concrete cited fact plus one sentence on why it
matters to the record. Name documents to demand by the title used in the
sources. Make every recommended step specific enough to hand to an investigator
as written and tie it to its cited gap.

## Fail to Meet Standards

Quote requirement language exactly with its section or regulation number where
shown. Describe conduct with dates, clock times, actors, and equipment
identifiers as recorded. Write each deviation in requirement, conduct,
difference order, with no editorializing.

## Legal Review

Identify every filing by exact caption or title, filing date, docket number if
stated, and signer. Report rulings in the court's own terms with short exact
quotes for operative language such as allowed, denied, or continued. Keep the
chronology strictly by date.

## Contradictions

Make each conflict visible at a glance. State the topic in a few words, then
each side's statement in the source's own words or a tight paraphrase, each with
its citation. Use exact figures, times, and descriptions in quantitative and
identification conflicts. The numbers themselves are the finding.

## Create Your Own

Use the general ARC style: people by full name and role on first mention; exact
dates, times, quantities, serial numbers, and document titles as the sources
state them; specific cited detail over general summary; short paragraphs with
one subject each. User instructions apply on top but never override grounding.
