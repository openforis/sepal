# Instance type usage

**Date:** 2026-09-29
**Data:** production database dump taken 27 Aug 2026 (restored in dev-env), `worker.worker_session`,
closed sessions created up to 26 Aug 2026. Dev-env sessions created after the dump are excluded.

## How the numbers are computed

- **Session hours** = `update_time − creation_time` of a closed session. Legacy billing used the same
  basis (`sdms.instance_use`), and so does `budget`'s instance-spending calculator.
- **Estimated cost** = session hours × the type's on-demand hourly rate in
  `modules/worker/src/hostingService/instanceTypes.js`. Retired types missing from the catalog
  (g4dn, r3) are priced at their last rate in git history.
- This is an estimate, not the AWS bill:
  - Hours are exact, while `budget` rounds each session up to a whole hour. With rounding, the
    sandbox total for the main period rises from $13.4k to $15.5k.
  - Idle-pool instance time (no session attached), EBS, storage and the always-on hosts are not
    included.
  - Older years are priced at the rates in the catalog, not at what AWS charged then.
- **Main period:** 8 Apr 2025 (the day the m6a/c7a/r6a/g5 catalog went live) to 26 Aug 2026,
  about 16.5 months. Earlier years appear only in the [history](#history-20162026) section.
- The new catalog (commit `4896c0ff9`, 25 Sep 2026: c8a replaces c7a, x2idn replaces x1, and
  m6id/c6id/r8id SSD types are added) is not deployed yet, so none of its new types appear here.
- `instance_usage_hourly` has no production data yet. This report can say which instances were
  running and for how long, but not how busy they were.

## Key findings

1. **Most users only need the smallest instance.** t3a.small accounts for 54% of sandbox sessions and
   31% of sandbox hours, but only 1.4% of estimated cost. 624 of 1,092 sandbox users (57%) never
   used anything else.
2. **GPUs are the biggest cost.** g5 instances make up 41% of estimated sandbox cost (46% in the
   last 12 months) and were used by only 30 users. g5.2xlarge on its own is 28%.
3. **Cost is highly concentrated.** One user accounts for 43% of all estimated sandbox cost
   (~$5.8k), almost all of it on g5.2xlarge (92% of that type's cost). Three users account for half
   of all sandbox cost and 20 users for 80%. The median user's cost is $0.13.
4. **Large instances are used in short bursts.** Instances with 64 or more vCPUs have median
   sessions of 1.3 h (x1.32xlarge: 33 min). They make up 1.7% of hours but 16% of cost.
5. **Long GPU sessions deserve a closer look.** 47 of 582 GPU sessions ran for more than 24 h, and
   the g5.2xlarge p90 is 27 h. Once production has utilisation data, it will show whether those
   instances were actually busy.
6. **Usage is down from its 2020–2021 peak.** Sandbox hours fell from ~51k/yr to ~24k in 2025.
   Estimated cost is recovering in 2026 ($7.2k by 26 Aug), driven by GPU use.
7. **Task executors cost almost nothing.** They all run on t3a.small: 8,918 sessions and $387 in the
   main period. Their hours jumped in Jan–Jun 2026 because of a few runs longer than 24 h.

## Sandbox usage by type (8 Apr 2025 – 26 Aug 2026)

Totals: 11,182 sessions, 1,092 users, 30,340 h, ~$13.4k estimated.
Sorted by estimated cost. *Replaced* means the type is dropped from the new, not-yet-deployed
catalog.

| Type | Tag | vCPU | GiB | $/h | Sessions | Users | Hours | % hours | Median h | p90 h | Est. $ | % cost |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| g5.2xlarge | g8 | 8 | 32 | 1.353 | 258 | 17 | 2,790 | 9.2 | 3.7 | 26.8 | 3,774 | 28.1 |
| g5.xlarge | g4 | 4 | 16 | 1.123 | 315 | 24 | 1,315 | 4.3 | 1.9 | 8.0 | 1,477 | 11.0 |
| r6a.16xlarge | r64 | 64 | 512 | 4.061 | 128 | 8 | 241 | 0.8 | 1.3 | 4.2 | 979 | 7.3 |
| m6a.4xlarge | m16 | 16 | 64 | 0.770 | 497 | 114 | 1,163 | 3.8 | 1.2 | 5.1 | 896 | 6.7 |
| r6a.4xlarge | r16 | 16 | 128 | 1.015 | 111 | 10 | 799 | 2.6 | 3.7 | 13.7 | 811 | 6.0 |
| m6a.16xlarge | m64 | 64 | 256 | 3.082 | 134 | 28 | 230 | 0.8 | 1.3 | 3.7 | 708 | 5.3 |
| c7a.8xlarge | *replaced* | 32 | 64 | 1.762 | 42 | 7 | 330 | 1.1 | 2.2 | 10.5 | 581 | 4.3 |
| m6a.2xlarge | m8 | 8 | 32 | 0.385 | 493 | 133 | 1,441 | 4.7 | 1.3 | 6.4 | 555 | 4.1 |
| m6a.xlarge | m4 | 4 | 16 | 0.193 | 963 | 170 | 2,820 | 9.3 | 1.2 | 6.8 | 543 | 4.1 |
| m6a.12xlarge | m48 | 48 | 192 | 2.311 | 79 | 22 | 185 | 0.6 | 1.2 | 6.0 | 428 | 3.2 |
| x1.32xlarge | *replaced* | 128 | 1920 | 16.006 | 17 | 9 | 25 | 0.1 | 0.6 | 4.4 | 404 | 3.0 |
| m6a.large | m2 | 2 | 8 | 0.096 | 579 | 99 | 3,898 | 12.8 | 1.4 | 12.9 | 375 | 2.8 |
| c7a.4xlarge | *replaced* | 16 | 32 | 0.881 | 176 | 58 | 313 | 1.0 | 0.9 | 4.4 | 276 | 2.1 |
| c7a.xlarge | *replaced* | 4 | 8 | 0.220 | 259 | 25 | 1,004 | 3.3 | 2.4 | 8.6 | 221 | 1.6 |
| g5.12xlarge | g48 | 48 | 192 | 6.332 | 9 | 5 | 34 | 0.1 | 0.6 | 24.4 | 217 | 1.6 |
| t3a.small | t1 | 2 | 2 | 0.020 | 6,006 | 975 | 9,455 | 31.2 | 0.6 | 3.0 | 193 | 1.4 |
| r6a.8xlarge | r32 | 32 | 256 | 2.030 | 22 | 8 | 94 | 0.3 | 1.5 | 9.8 | 191 | 1.4 |
| r6a.2xlarge | r8 | 8 | 64 | 0.508 | 68 | 14 | 340 | 1.1 | 2.1 | 12.2 | 173 | 1.3 |
| c7a.large | *replaced* | 2 | 4 | 0.110 | 272 | 23 | 1,470 | 4.8 | 3.0 | 10.4 | 162 | 1.2 |
| c7a.12xlarge | *replaced* | 48 | 96 | 2.643 | 25 | 9 | 59 | 0.2 | 1.3 | 7.3 | 157 | 1.2 |
| x1.16xlarge | *replaced* | 64 | 976 | 8.003 | 15 | 5 | 13 | 0.0 | 0.5 | 1.4 | 101 | 0.8 |
| t3a.medium | t2 | 2 | 4 | 0.041 | 621 | 114 | 1,982 | 6.5 | 1.2 | 7.1 | 81 | 0.6 |
| c7a.2xlarge | *replaced* | 8 | 16 | 0.440 | 50 | 17 | 144 | 0.5 | 1.6 | 6.8 | 63 | 0.5 |
| r6a.xlarge | r4 | 4 | 32 | 0.254 | 32 | 10 | 135 | 0.4 | 1.2 | 12.0 | 34 | 0.3 |
| r6a.large | r2 | 2 | 16 | 0.127 | 9 | 5 | 60 | 0.2 | 2.5 | 19.1 | 8 | 0.1 |

Two r5.2xlarge sessions from the switch-over day are omitted. m6a.large has a high p90
(12.9 h) for a small type: it is used for long, low-intensity sessions.

## By instance class and size

| Class | Sessions | Users | % hours | Est. $ | % cost |
|---|--:|--:|--:|--:|--:|
| GPU (g5) | 582 | 30 | 13.6 | 5,468 | 40.8 |
| General (m6a) | 2,745 | 328 | 32.1 | 3,506 | 26.1 |
| Memory (r6a) | 372 | 36 | 5.5 | 2,196 | 16.4 |
| Compute (c7a) | 824 | 104 | 10.9 | 1,460 | 10.9 |
| High-memory (x1) | 32 | 11 | 0.1 | 506 | 3.8 |
| Burstable (t3a) | 6,627 | 995 | 37.7 | 274 | 2.0 |

| Size (non-GPU) | Sessions | Users | % hours | Est. $ | % cost |
|---|--:|--:|--:|--:|--:|
| ≤2 vCPU | 7,487 | 1,010 | 55.6 | 819 | 6.1 |
| 4 vCPU | 1,254 | 192 | 13.0 | 799 | 6.0 |
| 8 vCPU | 613 | 148 | 6.3 | 791 | 5.9 |
| 16 vCPU | 784 | 163 | 7.5 | 1,983 | 14.8 |
| 32–48 vCPU | 168 | 37 | 2.2 | 1,357 | 10.1 |
| 64+ vCPU | 294 | 36 | 1.7 | 2,192 | 16.4 |

Only 194 users (18%) ever started a type with 16 or more vCPUs, or a GPU. The last 12 months
(27 Aug 2025 – 26 Aug 2026: 7,718 sessions, 857 users, ~$10.3k) look the same, except that the GPU
share of cost rises to 46%.

## Concentration within expensive types

Share of each type's estimated cost, per user:

| Type | Users | Top user | Top 3 users |
|---|--:|--:|--:|
| g5.2xlarge | 17 | 92% | 97% |
| g5.12xlarge | 5 | 78% | 98% |
| r6a.16xlarge | 8 | 71% | 97% |
| x1.16xlarge | 5 | 42% | 87% |
| m6a.16xlarge | 28 | 38% | 60% |
| g5.xlarge | 24 | 36% | 78% |
| x1.32xlarge | 9 | 32% | 75% |
| c7a.4xlarge | 58 | 29% | 50% |
| m6a.12xlarge | 22 | 24% | 61% |
| m6a.4xlarge | 114 | 23% | 51% |

The 16-vCPU general and compute types are used broadly. The GPU and 512-GiB memory types are
effectively used by a few people each.

## Session length

Sandbox sessions by size, main period:

| Size | <10 min | 10 min–1 h | 1–4 h | 4–12 h | 12–24 h | >24 h |
|---|--:|--:|--:|--:|--:|--:|
| ≤2 vCPU | 434 | 4,246 | 2,035 | 612 | 87 | 73 |
| 4 vCPU | 72 | 422 | 489 | 212 | 47 | 12 |
| 8 vCPU | 13 | 232 | 248 | 93 | 20 | 7 |
| 16 vCPU | 36 | 299 | 309 | 105 | 26 | 9 |
| 32–48 vCPU | 8 | 58 | 63 | 31 | 5 | 3 |
| 64+ vCPU | 12 | 97 | 163 | 21 | 0 | 1 |
| GPU | 28 | 149 | 183 | 116 | 59 | 47 |

GPU sessions stand out: 18% last longer than 12 h, compared with fewer than 5% for any CPU size.
The largest CPU types are almost never kept overnight.

## Monthly trend (sandbox, main period)

| Month | Users | Hours | Est. $ | of which GPU $ |
|---|--:|--:|--:|--:|
| 2025-04 (from 8th) | 160 | 1,803 | 557 | 262 |
| 2025-05 | 181 | 1,835 | 668 | 268 |
| 2025-06 | 172 | 2,081 | 967 | 233 |
| 2025-07 | 152 | 1,869 | 477 | 13 |
| 2025-08 | 114 | 2,582 | 505 | 9 |
| 2025-09 | 146 | 1,359 | 479 | 54 |
| 2025-10 | 160 | 1,853 | 769 | 176 |
| 2025-11 | 128 | 1,696 | 901 | 341 |
| 2025-12 | 103 | 1,310 | 844 | 353 |
| 2026-01 | 104 | 975 | 362 | 166 |
| 2026-02 | 115 | 1,546 | 660 | 132 |
| 2026-03 | 181 | 2,415 | 1,050 | 558 |
| 2026-04 | 146 | 2,758 | 1,403 | 942 |
| 2026-05 | 165 | 1,770 | 1,286 | 817 |
| 2026-06 | 168 | 2,194 | 1,286 | 574 |
| 2026-07 | 123 | 1,607 | 599 | 367 |
| 2026-08 (to 26th) | 115 | 685 | 596 | 204 |

The 100–180 monthly sandbox users are a stable base. Monthly cost varies with GPU use, which peaked
in Mar–Jun 2026.

## History (2016–2026)

Sandbox sessions per calendar year. Types are priced at catalog rates, so cost is only an estimate
and mainly useful for comparing years.

| Year | Sessions | Users | Hours | Est. $ | Largest cost class |
|---|--:|--:|--:|--:|---|
| 2016 (Nov–Dec) | 240 | 14 | 450 | 18 | — |
| 2017 | 8,772 | 553 | 13,153 | 5,227 | general (m4) 69% |
| 2018 | 11,817 | 910 | 19,248 | 8,641 | general (m4) 41% |
| 2019 | 16,519 | 1,222 | 32,653 | 14,790 | compute (c4/c5) 46% |
| 2020 | 14,517 | 989 | 51,493 | 26,665 | compute 37%, general 28%, memory 28% |
| 2021 | 13,956 | 956 | 50,073 | 22,781 | general 40%, GPU (g4dn) 23% |
| 2022 | 13,101 | 1,130 | 37,332 | 14,176 | GPU 30%, general 29% |
| 2023 | 18,123 | 1,279 | 44,782 | 17,736 | memory 36%, general 35% |
| 2024 | 12,709 | 949 | 40,745 | 17,183 | GPU 31%, general 26% |
| 2025 | 8,807 | 833 | 23,624 | 9,813 | GPU 37%, general 29% |
| 2026 (to 26 Aug) | 5,132 | 657 | 13,951 | 7,242 | GPU 52% |

Sandbox hours peaked in 2020–2021. Sessions and users peaked in 2023. The number of sessions has
fallen since then, while the GPU share of cost has kept rising.

## Task executors

All task executors have run on t3a.small since Feb 2020 (t2.small before that). In the main period
there were 8,918 sessions and 18,955 h, costing about $387. Their hours rose sharply in Jan–Jun 2026
(peaking at 3,724 h in June, compared with ~600 h a month before) because of long-running tasks. In June 2026,
29 sessions over 24 h made up 2,899 of that month's 3,724 hours. This is cheap on t3a.small, but
each of those runs holds an instance for more than a day.

## What this means for the new catalog

- **c7a → c8a.** 824 sessions from 104 users were on c7a. c8a costs ~5% more per hour but is 27–50%
  faster by the catalog's `performance` figures, so these users should get more work per dollar.
- **x1 → x2idn.** The price is the same and x2idn is roughly twice as fast. Only 11 users and ~$500
  were affected in 16 months, so the change is low-risk.
- **SSD types (m6id/c6id/r8id).** No data yet. The memory (r6a) and 16-vCPU users are the likely
  adopters, and they are a small group. Check adoption a couple of months after deployment.
- **Where to focus cost effort.** The GPU types and the ≥64-vCPU types are about 57% of cost and are
  used by a few dozen users. t3a.small serves most users for about 1% of cost. Idle detection and
  shut-down on GPU and large instances would therefore have a much bigger effect than any change to
  the small types.
